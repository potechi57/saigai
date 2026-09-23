"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LAST_SECTION_STORAGE_KEY, type Section } from "@/components/NavigationTracker";

// ヘッダー左上のロゴ・アプリ名（「ホームボタン」）。
//
// 【背景・会話ログより】以前は常に/map（PC版の検索・地図画面）へ固定
// リンクしていたが、/m以下（現場向け画面）を開いている最中にこれをタップすると、
// レスポンシブ対応していないPC版画面に飛んでしまい「画面が崩れる」問題があった。
// 現在地・地図を含む同じ1つのWebアプリ内でPC向け・現場（スマホ）向けの
// 画面を作り分けている都合上、「ホーム」の行き先自体がどちらの文脈にいるかで
// 変わるのが自然なため、現在のURLが/m以下かどうかで遷移先を出し分けるように
// した（ヘッダー自体はapp/layout.tsx＝Server Componentのため、ここだけ
// usePathname()が使えるクライアントコンポーネントとして切り出している）。
//
// 【共有ページ（/ledgers/[id]等）にいる場合について】上記の「/m配下かどうか」
// だけでは、/ledgers/[id]のようなPC・スマホ両方から辿り着ける共有ページ
// （パス自体は/m配下ではない）にいる間、スマホ経由で来ていてもPC版へ飛んで
// しまっていた（会話ログ「ヘッダーのタイトルを押したときもPC画面に飛びます」
// 参照。components/BackLink.tsxの「戻る」ボタンと同じ根本原因）。そこで、
// 現在のpathnameだけで判定できない場合は、components/NavigationTracker.tsxが
// 記録している「直近に/mまたは/mapのどちらへ来たか」（sessionStorage）を
// 併用する。sessionStorage参照はクライアントでのみ行えるため、SSR/初回描画時は
// 既定値（PC版）のままにし、マウント後のuseEffectで必要なら上書きする
// （わずかな遅延はあるが、ヘッダーロゴは初回描画直後にすぐ押されるものではない
// ため実害は無い）。
export default function HeaderHomeLink() {
  const pathname = usePathname();
  const pathSection: Section | null =
    pathname === "/m" || pathname?.startsWith("/m/")
      ? "mobile"
      : pathname === "/map" || pathname?.startsWith("/map/")
        ? "desktop"
        : null;

  const [storedSection, setStoredSection] = useState<Section | null>(null);
  useEffect(() => {
    if (pathSection) return; // pathnameだけで判定できる場合はsessionStorageを見る必要が無い
    try {
      const raw = sessionStorage.getItem(LAST_SECTION_STORAGE_KEY);
      if (raw === "mobile" || raw === "desktop") setStoredSection(raw);
    } catch {
      // sessionStorageが使えない環境では既定値（PC版）のまま。
    }
  }, [pathSection]);

  const section: Section = pathSection ?? storedSection ?? "desktop";

  return (
    <Link
      href={section === "mobile" ? "/m" : "/map"}
      className="truncate text-base font-bold text-gray-800 dark:text-gray-100 sm:text-lg"
    >
      道路施設管理 Web GIS{" "}
      <span className="text-sm font-normal text-gray-500 dark:text-gray-400">MVP</span>
    </Link>
  );
}
