"use client";

import { useActionState, useState, type FormEvent } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { importKarteExcel } from "@/lib/actions/import-actions";

// Server Actionの本文サイズには既定で上限があり（next.config.mjsで緩和済みだが、
// 本番のVercel Functions自体にも別途上限がある）、写真が埋め込まれた実際の防災カルテExcelは
// 数MB〜10MB近くになることが多い。そのため、一定サイズを超えるファイルはブラウザから
// 直接Vercel Blobへアップロードし、Server ActionにはそのURLだけを渡す
// （app/api/blob-upload/route.ts、lib/actions/import-actions.tsのコメントも参照）。
const DIRECT_UPLOAD_THRESHOLD_BYTES = 700 * 1024; // 700KB。Next.jsの既定1MB制限より安全側に

// 取込作業には「①ブラウザ→Blobへのアップロード」「②サーバー側での解析・DB登録」の
// 2段階があり、それぞれ進捗の見せ方が異なる。①はファイルサイズが大きいと数秒〜十数秒
// かかるため@vercel/blobのonUploadProgressで%表示する。②はServer Actionが完了時に
// 1回だけ結果を返す仕組み上、中間進捗を受け取る手段が無いため、不確定進捗（スピナー）で
// 「解析・登録中」であることだけ示す（useActionStateのisPendingで判定する）。

// エラー内容を画面にそのまま表示したいため、他の編集フォームと違い
// useActionState（React 19）でServer Actionの戻り値を受け取る形にしている。
export default function ExcelImportForm() {
  const [state, formAction, isPending] = useActionState(importKarteExcel, null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size <= DIRECT_UPLOAD_THRESHOLD_BYTES) {
      // 小さいファイルはそのまま従来どおりネイティブ<form>送信に任せる
      // （ローカル開発などVercel Blob未設定の環境でもここは動く）。進捗はサーバー側の
      // 「解析・登録中」表示のみになるが、小さいファイルは元々一瞬で終わるため問題ない。
      return;
    }

    // 大きいファイルはブラウザから直接Blobへアップロードしてから、URLだけをServer Actionへ渡す。
    e.preventDefault();
    setIsUploading(true);
    setUploadPercent(0);
    try {
      const blob = await upload(`karte-imports/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
        onUploadProgress: ({ percentage }) => setUploadPercent(percentage),
      });
      const fd2 = new FormData();
      fd2.set("blobUrl", blob.url);
      fd2.set("fileName", file.name);
      formAction(fd2);
    } catch {
      // Vercel Blobが未設定の環境（ローカル開発など）ではここで失敗しうる。
      // その場合は従来どおりファイル本体を直接Server Actionに送る経路にフォールバックする
      // （700KB超のファイルだとNext.jsの本文サイズ上限に引っかかる可能性はあるが、
      // ローカル開発での小規模テストを妨げないためのベストエフォート）。
      formAction(fd);
    } finally {
      setIsUploading(false);
    }
  }

  const busy = isUploading || isPending;

  return (
    <div className="space-y-4">
      <form action={formAction} onSubmit={handleSubmit} className="space-y-4 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">防災カルテExcelファイル（.xls / .xlsx）</span>
          <input type="file" name="file" accept=".xls,.xlsx" required disabled={busy} className="block w-full text-sm" />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          取り込む
        </button>

        {busy && (
          <div className="space-y-1.5" aria-live="polite">
            {isUploading ? (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-gray-800 transition-[width] dark:bg-gray-300"
                    style={{ width: `${Math.max(uploadPercent, 3)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ① アップロード中... {Math.round(uploadPercent)}%
                </p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700 dark:border-gray-600 dark:border-t-gray-200" />
                ② 解析・登録中...（写真が多いファイルは少し時間がかかります）
              </p>
            )}
          </div>
        )}
      </form>

      {state && !state.ok && (
        <p className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-400">{state.error}</p>
      )}
      {state && state.ok && (
        <p className="rounded border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3 text-sm text-green-800 dark:text-green-400">
          取り込みが完了しました（点検記録 {state.eventsImported} 件）。{" "}
          <Link href={`/karte/${state.facilityNo}`} className="underline">
            カルテを確認する →
          </Link>
        </p>
      )}
    </div>
  );
}
