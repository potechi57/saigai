"use client";

import Link from "next/link";
import { useBulkImport } from "@/components/BulkImportContext";

// 「まとめて取り込む（複数ファイル）」の実行中、取込画面（/map/import）以外の
// どのページを見ていても進捗が分かるように、ヘッダーに常時表示する小さな
// バッジ（会話ログ「取り込んでいる間、別のページを開いてもそのページの処理が
// 自動で続くようにしてほしい」参照。処理自体はBulkImportProvider側で既に
// 継続するため、これは「続いていることが見える」ようにするための表示専用）。
// 実行中でなければ何も表示しない。
export default function BulkImportStatusBadge() {
  const { files, running } = useBulkImport();
  if (!running) return null;

  const doneCount = files.filter((f) => f.status === "success" || f.status === "error").length;

  return (
    <Link
      href="/map/import"
      className="flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:underline dark:bg-blue-900 dark:text-blue-300"
      title="Excel取込（まとめて）が実行中です。クリックすると取込画面に移動します。"
    >
      📥 取込中 {doneCount}/{files.length}
    </Link>
  );
}
