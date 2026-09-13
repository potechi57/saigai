"use client";

import { useEffect } from "react";
import { pushViewHistory, type ViewHistoryKind } from "@/components/ViewHistoryButton";

// カルテ・施設台帳・台帳（画像）の各詳細画面に埋め込むだけの「見えない
// コンポーネント」。マウント時（＝その記録を開いたとき）に閲覧履歴
// （localStorage、components/ViewHistoryButton.tsx）へ記録する。以前はカルテ専用
// だったが、施設台帳・台帳（画像）の詳細ページでも使えるよう汎用化した
// （会話ログ「それ以外の登録や編集の内容を表示するようにしてほしい」参照）。
export default function RecordViewHistory({
  kind,
  id,
  title,
  subtitle,
  href,
}: {
  kind: ViewHistoryKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}) {
  useEffect(() => {
    pushViewHistory({ kind, id, title, subtitle, href });
  }, [kind, id, title, subtitle, href]);

  return null;
}
