"use client";

import { useState } from "react";
import MobileMapView from "@/components/MobileMapLoader";
import MobileSearchPanel from "@/components/MobileSearchPanel";
import type { MobileSearchResult } from "@/lib/mobile-search";

// /mのトップ画面（地図＋検索パネル）の開閉状態を、地図（MobileMapView）と
// パネル（MobileSearchPanel）の両方から参照・変更できるようにするための
// まとめ役。両者はapp/m/page.tsx（Server Component）の中では兄弟同士で
// 状態を共有できないため、この1つのクライアントコンポーネントに閉じ込めている
// （会話ログ「地図タップでパネルを自動的に閉じる」対応）。
export default function MobileHomeShell({
  results,
  center,
  radiusM,
  defaultOpen,
  children,
}: {
  results: MobileSearchResult[];
  center: { lat: number; lng: number } | null;
  // 現在地検索の半径（会話ログ「現在地検索の半径変更」）。地図上の同心円の
  // 大きさに使う。centerが無い場合は使われない。
  radiusM: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <MobileMapView results={results} center={center} radiusM={radiusM} onMapTap={() => setOpen(false)} />
      <MobileSearchPanel open={open} onOpenChange={setOpen}>
        {children}
      </MobileSearchPanel>
    </>
  );
}
