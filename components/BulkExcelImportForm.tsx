"use client";

import { type ChangeEvent } from "react";
import Link from "next/link";
import { useBulkImport, type FileStatus } from "@/components/BulkImportContext";

// 実際の取込処理・進捗の状態は、別ページに移動しても続けられるよう
// components/BulkImportContext.tsx（ルートレイアウトに配置）側に持たせている
// （会話ログ「取り込んでいる間、別のページを開いてもそのページの処理が自動で
// 続くようにしてほしい」参照）。このコンポーネント自体はその状態を表示する
// だけの「見た目」担当になっている。

const STATUS_LABEL: Record<FileStatus, { label: string; className: string }> = {
  waiting: { label: "待機中", className: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300" },
  uploading: { label: "処理中", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  processing: { label: "処理中", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  success: { label: "成功", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  error: { label: "失敗", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

export default function BulkExcelImportForm() {
  const { files, running, setFilesFromInput, removeQueuedFile, start } = useBulkImport();

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    setFilesFromInput(Array.from(e.target.files ?? []));
  }

  const doneCount = files.filter((f) => f.status === "success" || f.status === "error").length;
  const successCount = files.filter((f) => f.status === "success").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div className="space-y-3 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">まとめて取り込む（複数ファイル）</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        複数のExcelファイルを選択すると、1件ずつ順番に取り込みます。途中で1件失敗しても他のファイルの取込は続行します。
        取込中に他の画面へ移動しても処理は続き、ヘッダーの「📥 取込中」表示から進み具合を確認できます
        （ブラウザのタブを閉じると処理は止まりますので、完了まで開いたままにしてください）。
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
            onClick={start}
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
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const status = STATUS_LABEL[f.status];
                  return (
                    <tr key={f.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="max-w-[16rem] truncate px-3 py-2 text-gray-800 dark:text-gray-100" title={f.file.name}>
                        {f.file.name}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {f.status === "success" && f.facilityNo ? (
                          <Link href={`/map/${f.facilityNo}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {f.facilityNo} を確認する →
                          </Link>
                        ) : (
                          f.detail
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {/* 順番待ち（waiting）の間だけ取りやめられる（会話ログ
                            「順番待ちの時に取りやめる×ボタンを追加すること」参照）。
                            処理開始後は安全に中断する手段が無いため対象外。 */}
                        {f.status === "waiting" && (
                          <button
                            type="button"
                            onClick={() => removeQueuedFile(f.id)}
                            title="このファイルを取りやめる"
                            aria-label={`${f.file.name}を取りやめる`}
                            className="flex items-center gap-0.5 whitespace-nowrap text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
                          >
                            <span aria-hidden="true">×</span>
                            キャンセル
                          </button>
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
