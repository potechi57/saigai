"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import {
  importKarteExcel,
  importPhase1KarteAndFormA,
  importPhase2FormBTarget,
  importPhase3Events,
} from "@/lib/actions/import-actions";

// ExcelImportForm.tsxと同じ閾値・同じフェーズ分割方式をそのまま踏襲する
// （理由はExcelImportForm.tsxのコメント参照）。複数ファイルをまとめて選べる点だけが違う。
const DIRECT_UPLOAD_THRESHOLD_BYTES = 700 * 1024;

type FileStatus = "waiting" | "uploading" | "processing" | "success" | "error";

type FileState = {
  file: File;
  status: FileStatus;
  detail: string; // 進捗ラベル（処理中）またはエラー内容・完了内容
  facilityNo?: string;
};

// 1ファイル分の処理（ExcelImportForm.tsxのhandleSubmitと同じロジック）。
// バッチ処理では「1件失敗しても他のファイルは止めない」ことが重要なため、
// 例外を投げず必ずFileStateを返す形にしている。
async function processOneFile(
  file: File,
  onDetail: (detail: string) => void
): Promise<{ ok: true; facilityNo: string } | { ok: false; error: string }> {
  try {
    if (file.size <= DIRECT_UPLOAD_THRESHOLD_BYTES) {
      onDetail("解析・登録中...");
      const fd = new FormData();
      fd.append("file", file);
      const r = await importKarteExcel(null, fd);
      return r.ok ? { ok: true, facilityNo: r.facilityNo } : { ok: false, error: r.error };
    }

    onDetail("アップロード中...");
    let blobUrl: string;
    try {
      const blob = await upload(`karte-imports/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
      });
      blobUrl = blob.url;
    } catch {
      // Vercel Blob未設定環境向けのフォールバック（ExcelImportForm.tsxと同じ方針）。
      onDetail("解析・登録中...");
      const fd = new FormData();
      fd.append("file", file);
      const r = await importKarteExcel(null, fd);
      return r.ok ? { ok: true, facilityNo: r.facilityNo } : { ok: false, error: r.error };
    }

    onDetail("① カルテ基本情報（様式Ａ）を解析中...");
    const phase1 = await importPhase1KarteAndFormA(blobUrl, file.name);
    if (!phase1.ok) return { ok: false, error: phase1.error };

    for (let i = 0; i < phase1.formBSheetNames.length; i++) {
      onDetail(`② 点検対象を取込中（${i + 1}/${phase1.formBSheetNames.length}）`);
      const phase2 = await importPhase2FormBTarget(
        phase1.karteId,
        blobUrl,
        phase1.formBSheetNames[i],
        phase1.historyId,
        phase1.isNewKarte
      );
      if (!phase2.ok) return { ok: false, error: phase2.error };
    }

    onDetail("③ 点検記録（様式Ｃ）を取込中...");
    const phase3 = await importPhase3Events(phase1.karteId, phase1.facilityNo, blobUrl, phase1.historyId);
    if (!phase3.ok) return { ok: false, error: phase3.error };

    return { ok: true, facilityNo: phase1.facilityNo };
  } catch (err) {
    return { ok: false, error: `取込に失敗しました（詳細: ${err instanceof Error ? err.message : String(err)}）` };
  }
}

const STATUS_LABEL: Record<FileStatus, { label: string; className: string }> = {
  waiting: { label: "待機中", className: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300" },
  uploading: { label: "処理中", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  processing: { label: "処理中", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  success: { label: "成功", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  error: { label: "失敗", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

export default function BulkExcelImportForm() {
  const router = useRouter();
  const [files, setFiles] = useState<FileState[]>([]);
  const [running, setRunning] = useState(false);

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles(selected.map((file) => ({ file, status: "waiting", detail: "" })));
  }

  // 1件ずつ順番に処理する（並列処理はしない）。理由:
  // - Cloud Run側のEMF変換サービスが1コンテナ内--concurrency=1で動く設計のため、
  //   同時に複数リクエストを送っても安定して速くなるわけではない。
  // - 1件が失敗しても他のファイルには影響させず、最後まで通して結果一覧を出す。
  async function handleRun() {
    setRunning(true);
    for (let i = 0; i < files.length; i++) {
      setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "processing", detail: "" } : f)));
      const target = files[i].file;
      const result = await processOneFile(target, (detail) => {
        setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, detail } : f)));
      });
      setFiles((prev) =>
        prev.map((f, idx) =>
          idx === i
            ? result.ok
              ? { ...f, status: "success", detail: "取込完了", facilityNo: result.facilityNo }
              : { ...f, status: "error", detail: result.error }
            : f
        )
      );
    }
    setRunning(false);
    router.refresh(); // 取込履歴一覧を最新化する
  }

  const doneCount = files.filter((f) => f.status === "success" || f.status === "error").length;
  const successCount = files.filter((f) => f.status === "success").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div className="space-y-3 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">まとめて取り込む（複数ファイル）</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        複数のExcelファイルを選択すると、1件ずつ順番に取り込みます。途中で1件失敗しても他のファイルの取込は続行します。
        ファイルを選んだ後にタブを閉じると処理は止まりますので、完了まで開いたままにしてください。
      </p>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">防災カルテExcelファイル（複数選択可・.xls / .xlsx）</span>
        <input
          type="file"
          accept=".xls,.xlsx"
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
                        {f.status === "success" && f.facilityNo ? (
                          <Link href={`/karte/${f.facilityNo}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {f.facilityNo} を確認する →
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
