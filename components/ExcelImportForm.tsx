"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import {
  importKarteExcel,
  importPhase1KarteAndFormA,
  importPhase2FormBTarget,
  importPhase3Events,
  type ImportKarteResult,
} from "@/lib/actions/import-actions";

// Server Actionの本文サイズには既定で上限があり（next.config.mjsで緩和済みだが、
// 本番のVercel Functions自体にも別途上限がある）、写真が埋め込まれた実際の防災カルテExcelは
// 数MB〜10MB近くになることが多い。そのため、一定サイズを超えるファイルはブラウザから
// 直接Vercel Blobへアップロードし、その後の処理はBlob上のファイルを参照する
// フェーズ分割版（importPhase1〜3）で行う
// （app/api/blob-upload/route.ts、lib/actions/import-actions.tsのコメントも参照）。
const DIRECT_UPLOAD_THRESHOLD_BYTES = 700 * 1024; // 700KB。Next.jsの既定1MB制限より安全側に

// 取込作業の進捗を画面で正確に追えるようにしている。以前は「①アップロード」の
// バイト単位%表示のあとは「②解析・登録中...」という不確定スピナーしか出せず、
// アップロードが100%になってから実際にカルテが見られるようになるまでかなりの
// 時間差があった（写真のアップロード・点検対象ごとの処理等、実際にはこの間に
// 多くの作業が行われているが、それを示す手段が無かったため）。
//
// これを解消するため、サーバー側の処理を「①カルテ基本情報（様式Ａ）」
// 「②点検対象1件ずつ（様式Ｂ、シート数分）」「③点検記録（様式Ｃ、最終フェーズ）」
// という複数回のServer Action呼び出しに分割し、1回の呼び出しが完了するたびに
// 進捗を進める。「③」が完了した時点で初めてカルテ詳細ページが最新化される
// （revalidatePathもここで行う）ため、進捗100%と実際に見られるタイミングが一致する。
type Progress =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "indeterminate"; label: string }
  | { kind: "step"; label: string; completed: number; total: number };

export default function ExcelImportForm() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>({ kind: "idle" });
  const [result, setResult] = useState<ImportKarteResult | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return;

    setResult(null);

    // 小さいファイルはBlobを経由せずそのままServer Actionに送る
    // （ローカル開発などVercel Blob未設定の環境でも動く従来経路。元々一瞬で終わるため
    // 段階的な進捗表示は不要と判断し、スピナーのみにしている）。
    if (file.size <= DIRECT_UPLOAD_THRESHOLD_BYTES) {
      setProgress({ kind: "indeterminate", label: "解析・登録中..." });
      const r = await importKarteExcel(null, fd);
      setResult(r);
      setProgress({ kind: "idle" });
      router.refresh(); // 取込履歴一覧（このページ内）を最新化する
      return;
    }

    setProgress({ kind: "uploading", percent: 0 });
    let blobUrl: string;
    try {
      const blob = await upload(`karte-imports/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
        onUploadProgress: ({ percentage }) => setProgress({ kind: "uploading", percent: percentage }),
      });
      blobUrl = blob.url;
    } catch {
      // Vercel Blobが未設定の環境（ローカル開発など）ではここで失敗しうる。
      // その場合は従来どおりファイル本体を直接Server Actionに送る経路にフォールバックする
      // （700KB超のファイルだとNext.jsの本文サイズ上限に引っかかる可能性はあるが、
      // ローカル開発での小規模テストを妨げないためのベストエフォート）。
      setProgress({ kind: "indeterminate", label: "解析・登録中..." });
      const r = await importKarteExcel(null, fd);
      setResult(r);
      setProgress({ kind: "idle" });
      router.refresh(); // 取込履歴一覧（このページ内）を最新化する
      return;
    }

    try {
      setProgress({ kind: "indeterminate", label: "① カルテ基本情報（様式Ａ）を解析中..." });
      const phase1 = await importPhase1KarteAndFormA(blobUrl, file.name);
      if (!phase1.ok) {
        setResult(phase1);
        return;
      }

      // ①（完了済み）＋様式Ｂのシート数（点検対象1件＝1ステップ）＋③（点検記録）
      const total = 1 + phase1.formBSheetNames.length + 1;
      let completed = 1;
      setProgress({ kind: "step", label: "カルテ基本情報", completed, total });

      for (let i = 0; i < phase1.formBSheetNames.length; i++) {
        setProgress({
          kind: "step",
          label: `点検対象を取込中（${i + 1}/${phase1.formBSheetNames.length}）`,
          completed,
          total,
        });
        const phase2 = await importPhase2FormBTarget(phase1.karteId, blobUrl, phase1.formBSheetNames[i], phase1.historyId);
        if (!phase2.ok) {
          setResult(phase2);
          return;
        }
        completed++;
        setProgress({ kind: "step", label: "点検対象", completed, total });
      }

      setProgress({ kind: "step", label: "点検記録（様式Ｃ）を取込中...", completed, total });
      const phase3 = await importPhase3Events(phase1.karteId, phase1.facilityNo, blobUrl, phase1.historyId);
      completed++;
      setProgress({ kind: "step", label: "完了", completed, total });

      setResult(
        phase3.ok
          ? { ok: true, facilityNo: phase1.facilityNo, eventsImported: phase3.eventsImported }
          : phase3
      );
    } catch (err) {
      setResult({
        ok: false,
        error: `取込に失敗しました（詳細: ${err instanceof Error ? err.message : String(err)}）`,
      });
    } finally {
      setProgress({ kind: "idle" });
      router.refresh(); // 取込履歴一覧（このページ内）を最新化する（成功・失敗いずれの場合も）
    }
  }

  const busy = progress.kind !== "idle";

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
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
            {progress.kind === "uploading" && (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-gray-800 transition-[width] dark:bg-gray-300"
                    style={{ width: `${Math.max(progress.percent, 3)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ① アップロード中... {Math.round(progress.percent)}%
                </p>
              </>
            )}
            {progress.kind === "indeterminate" && (
              <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700 dark:border-gray-600 dark:border-t-gray-200" />
                {progress.label}
              </p>
            )}
            {progress.kind === "step" && (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-gray-800 transition-[width] dark:bg-gray-300"
                    style={{ width: `${Math.max((progress.completed / progress.total) * 100, 5)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ② {progress.label}（{progress.completed}/{progress.total}）
                </p>
              </>
            )}
          </div>
        )}
      </form>

      {result && !result.ok && (
        <p className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-400">{result.error}</p>
      )}
      {result && result.ok && (
        <p className="rounded border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3 text-sm text-green-800 dark:text-green-400">
          取り込みが完了しました（点検記録 {result.eventsImported} 件）。{" "}
          <Link href={`/karte/${result.facilityNo}`} className="underline">
            カルテを確認する →
          </Link>
        </p>
      )}
    </div>
  );
}
