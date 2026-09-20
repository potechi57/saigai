"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  importKarteExcel,
  importPhase1KarteAndFormA,
  importPhase2FormBTarget,
  importPhase3Events,
} from "@/lib/actions/import-actions";

// 「まとめて取り込む（複数ファイル）」の状態を、components/BulkExcelImportForm.tsx
// 単体のuseStateではなく、ルートレイアウト（app/layout.tsx）に置いたこの
// Contextで持つようにしている。
//
// 【経緯】以前は取込画面（BulkExcelImportForm）のローカルstateで進捗を持って
// いたが、「取り込んでいる間、別のページを開いてもそのページの処理が自動で
// 続くようにしてほしい」との要望を受けて調査した。実際にはアプリ内の通常の
// リンク遷移（next/linkによるSPA遷移）ではJavaScriptの実行コンテキスト自体は
// 破棄されないため、取込処理（fetch・Server Action呼び出し）自体は裏で
// 継続することを実機で確認済み（会話ログ参照）。しかし進捗を表示している
// BulkExcelImportFormコンポーネント自体はページ遷移でアンマウントされるため、
// 「処理は続いているのに進捗が見えない・取込画面に戻ると空の状態に見える」
// という体験になっていた。
//
// ルートレイアウトは通常のページ遷移（同一タブ内のSPA遷移）ではアンマウント
// されないため、ここにstateを置くことで、別画面に移動しても進捗を保持でき、
// ヘッダーの小さな進捗表示（BulkImportStatusBadge参照）からいつでも状況を
// 確認できるようにした。ブラウザのタブを閉じる・再読み込みした場合は
// 従来どおり処理が止まる（Fileオブジェクト自体はブラウザを閉じると保持できない
// ため、これは変えていない）。
export type FileStatus = "waiting" | "uploading" | "processing" | "success" | "error";

export type FileState = {
  id: string;
  file: File;
  status: FileStatus;
  detail: string;
  facilityNo?: string;
};

type BulkImportContextValue = {
  files: FileState[];
  running: boolean;
  setFilesFromInput: (files: File[]) => void;
  removeQueuedFile: (id: string) => void;
  start: () => void;
};

const BulkImportContext = createContext<BulkImportContextValue | null>(null);

// ExcelImportForm.tsxと同じ閾値・同じフェーズ分割方式をそのまま踏襲する
// （理由はExcelImportForm.tsxのコメント参照）。複数ファイルをまとめて選べる点だけが違う。
const DIRECT_UPLOAD_THRESHOLD_BYTES = 700 * 1024;

// 1ファイル分の処理（ExcelImportForm.tsxのhandleSubmitと同じロジック）。
// バッチ処理では「1件失敗しても他のファイルは止めない」ことが重要なため、
// 例外を投げず必ず結果を返す形にしている。
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

export function BulkImportProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [files, setFilesState] = useState<FileState[]>([]);
  const [running, setRunning] = useState(false);
  // 実行中のループ（start内のfor文）は非同期に何ステップも進むため、Reactの
  // 通常のstateクロージャ（呼び出し時点のスナップショット）ではなく、常に
  // 最新の配列を参照できるrefを併用する。×ボタンで途中キャンセルされた
  // ファイルを、ループ側が正しく「もう無い」と検知できるようにするため。
  const filesRef = useRef<FileState[]>([]);

  const setFiles = useCallback((updater: (prev: FileState[]) => FileState[]) => {
    setFilesState((prev) => {
      const next = updater(prev);
      filesRef.current = next;
      return next;
    });
  }, []);

  const setFilesFromInput = useCallback(
    (selected: File[]) => {
      const next = selected.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "waiting" as const,
        detail: "",
      }));
      setFiles(() => next);
    },
    [setFiles]
  );

  // 順番待ち（waiting）のファイルだけを取りやめられるようにする（会話ログ
  // 「順番待ちの時に取りやめる×ボタンを追加すること」参照）。処理中・完了済みの
  // ファイルは対象外（既に開始した取込を安全に中断する手段が無いため）。
  const removeQueuedFile = useCallback(
    (id: string) => {
      setFiles((prev) => prev.filter((f) => !(f.id === id && f.status === "waiting")));
    },
    [setFiles]
  );

  const start = useCallback(() => {
    setRunning(true);
    (async () => {
      // 開始時点で「待機中」だったファイルのIDだけを処理対象にする（開始後に
      // 選び直すことは無い＝input disabled中のため、実質「現在のfiles全件」と
      // 同じだが、念のためstatusで絞る）。
      const queueIds = filesRef.current.filter((f) => f.status === "waiting").map((f) => f.id);
      for (const id of queueIds) {
        const current = filesRef.current.find((f) => f.id === id);
        // ループが到達する前に×で取りやめられていた場合はスキップする。
        if (!current || current.status !== "waiting") continue;

        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status: "processing", detail: "" } : f)));
        const result = await processOneFile(current.file, (detail) => {
          setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, detail } : f)));
        });
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? result.ok
                ? { ...f, status: "success", detail: "取込完了", facilityNo: result.facilityNo }
                : { ...f, status: "error", detail: result.error }
              : f
          )
        );
      }
      setRunning(false);
      router.refresh(); // 取込履歴一覧を最新化する（取込画面を開いていれば反映される）
    })();
  }, [setFiles, router]);

  return (
    <BulkImportContext.Provider value={{ files, running, setFilesFromInput, removeQueuedFile, start }}>
      {children}
    </BulkImportContext.Provider>
  );
}

export function useBulkImport(): BulkImportContextValue {
  const ctx = useContext(BulkImportContext);
  if (!ctx) throw new Error("useBulkImport must be used within BulkImportProvider");
  return ctx;
}
