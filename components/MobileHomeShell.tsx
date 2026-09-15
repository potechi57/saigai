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
  defaultOpen,
  children,
}: {
  results: MobileSearchResult[];
  center: { lat: number; lng: number } | null;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <MobileMapView results={results} center={center} onMapTap={() => setOpen(false)} />
      <MobileSearchPanel open={open} onOpenChange={setOpen}>
        {children}
      </MobileSearchPanel>
    </>
  );
}
