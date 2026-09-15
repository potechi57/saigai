"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ヘッダー左上のロゴ・アプリ名（「ホームボタン」）。
//
// 【背景・会話ログより】以前は常に/karte（PC版の検索・地図画面）へ固定
// リンクしていたが、/m以下（現場向け画面）を開いている最中にこれをタップすると、
// レスポンシブ対応していないPC版画面に飛んでしまい「画面が崩れる」問題があった。
// 現在地・地図を含む同じ1つのWebアプリ内でPC向け・現場（スマホ）向けの
// 画面を作り分けている都合上、「ホーム」の行き先自体がどちらの文脈にいるかで
// 変わるのが自然なため、現在のURLが/m以下かどうかで遷移先を出し分けるように
// した（ヘッダー自体はapp/layout.tsx＝Server Componentのため、ここだけ
// usePathname()が使えるクライアントコンポーネントとして切り出している）。
export default function HeaderHomeLink() {
  const pathname = usePathname();
  const isMobileSection = pathname === "/m" || pathname?.startsWith("/m/");

  return (
    <Link
      href={isMobileSection ? "/m" : "/karte"}
      className="truncate text-base font-bold text-gray-800 dark:text-gray-100 sm:text-lg"
    >
      道路施設管理 Web GIS{" "}
      <span className="text-sm font-normal text-gray-500 dark:text-gray-400">MVP</span>
    </Link>
  );
}
