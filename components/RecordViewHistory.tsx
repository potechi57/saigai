"use client";

import { useEffect } from "react";
import { pushViewHistory } from "@/components/ViewHistoryButton";

// カルテ詳細画面に埋め込むだけの「見えないコンポーネント」。マウント時（＝そのカルテを
// 開いたとき）に閲覧履歴（localStorage、components/ViewHistoryButton.tsx）へ記録する。
export default function RecordViewHistory({ facilityNo, routeName }: { facilityNo: string; routeName: string }) {
  useEffect(() => {
    pushViewHistory({ facilityNo, routeName });
  }, [facilityNo, routeName]);

  return null;
}
