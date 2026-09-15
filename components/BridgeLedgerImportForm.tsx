"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { importBridgeLedgerExcel } from "@/lib/actions/bridge-ledger-actions";

// 橋梁台帳Excelの取込フォーム。components/GateSignInspectionImportForm.tsxと
// 同じUI・同じ「1件ずつ順番に処理し、1件失敗しても他は続行する」方針
// （会話ログ「点検調書やカルテ点検の表示形式のような形」参照）。

type FileStatus = "waiting" | "processing" | "success" | "error";

type FileState = {
  file: File;
  status: FileStatus;
  detail: string;
  id?: string;
  managementNo?: string | null;
  matchedFacility?: boolean;
};

const STATUS_LABEL: Record<FileStatus, { label: string; className: string }> = {
  waiting: { label: "待機中", className: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300" },
  processing: { label: "処理中", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  success: { label: "成功", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  error: { label: "失敗", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

export default function BridgeLedgerImportForm() {
  const router = useRouter();
  const [files, setFiles] = useState<FileState[]>([]);
  const [running, setRunning] = useState(false);

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles(selected.map((file) => ({ file, status: "waiting", detail: "" })));
  }

  async function handleRun() {
    setRunning(true);
    for (let i = 0; i < files.length; i++) {
      setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "processing", detail: "解析・登録中..." } : f)));
      const fd = new FormData();
      fd.append("file", files[i].file);
      const result = await importBridgeLedgerExcel(null, fd);
      setFiles((prev) =>
        prev.map((f, idx) =>
          idx === i
            ? result.ok
              ? {
                  ...f,
                  status: "success",
                  detail: result.matchedFacility ? "施設台帳と紐付けて取込完了" : "施設台帳と紐付かず取込完了（管理番号未一致）",
                  id: result.id,
                  managementNo: result.managementNo,
                  matchedFacility: result.matchedFacility,
                }
              : { ...f, status: "error", detail: result.error }
            : f
        )
      );
    }
    setRunning(false);
    router.refresh();
  }

  const doneCount = files.filter((f) => f.status === "success" || f.status === "error").length;
  const successCount = files.filter((f) => f.status === "success").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div className="space-y-3 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">橋梁台帳Excelを取り込む</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        複数のExcelファイルを選択すると、1件ずつ順番に取り込みます。同じ管理番号のファイルを再度取り込むと、内容を差し替えます。途中で1件失敗しても他のファイルの取込は続行します。
      </p>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">橋梁台帳Excelファイル（複数選択可・.xlsx）</span>
        <input
          type="file"
          accept=".xlsx"
          multiple
          disabled={running}
          onChange={handleFilesSelected}
          className="block w-full text-sm"
        />
      </label>

      {files.length > 0 && (
        <>
          <button
            type="button"
            onClick={handleRun}
            disabled={running || files.every((f) => f.status !== "waiting")}
            className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {running ? "取込中..." : `${files.length}件を取り込む`}
          </button>

          {(running || doneCount > 0) && (
            <p className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
              {doneCount}/{files.length}件 完了（成功{successCount}件・失敗{errorCount}件）
            </p>
          )}

          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">ファイル名</th>
                  <th className="px-3 py-2">状態</th>
                  <th className="px-3 py-2">詳細</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => {
                  const status = STATUS_LABEL[f.status];
                  return (
                    <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="max-w-[16rem] truncate px-3 py-2 text-gray-800 dark:text-gray-100" title={f.file.name}>
                        {f.file.name}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {f.status === "success" && f.id ? (
                          <Link href={`/inspections/bridges/${f.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {f.detail} →
                          </Link>
                        ) : (
                          f.detail
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
