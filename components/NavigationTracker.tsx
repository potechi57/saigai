"use client";

// アプリ内で実際に何回ページ遷移したかをsessionStorageに記録する、見た目を
// 持たない常駐コンポーネント（app/layout.tsxにマウントする）。
//
// 【なぜ必要か】components/BackLink.tsxは「実際にこのアプリ内の画面から遷移して
// きたか」をdocument.referrerで判定していたが、Next.jsのクライアントサイド遷移
// （<Link>によるSPA的な画面遷移。History APIのpushStateを使うため、ブラウザは
// document.referrerを更新しない）では、実際にアプリ内から遷移してきた場合でも
// document.referrerが空のままになることが実機検証で判明した（会話ログ
// 「スマホ用で何かしらの台帳から検索画面に戻った時に、必ずPC版の画面に
// 移動してしまう」の原因調査より）。そのため、アプリ内遷移の判定をreferrerに
// 頼らず、このコンポーネント自身が記録する遷移回数（sessionStorage、タブ単位で
// 自動的にリセットされる）で行う方式に切り替えた。
//
// usePathnameの変更をトリガーに1ずつ加算するだけの単純なカウンタで、重複排除等は
// 行わない（BackLink側では「1ページ目より後か（>1）」だけを見るため、厳密な
// 訪問履歴を保持する必要はない）。クエリ文字列だけが変わる遷移（例: /m→/m?q=…）は
// pathnameが変わらないためカウントされないが、BackLinkの判定には影響しない
// （その後の実際のページ遷移で必ずカウントが増えるため）。
//
// 【lastSectionについて】同じ理由（現在のpathnameだけでは判断できない）で、
// components/HeaderHomeLink.tsxの「ヘッダーのロゴ押下時にPC版/スマホ版どちらへ
// 戻るか」も、/ledgers/[id]等（PC・スマホ両方から辿り着ける共有ページで、
// パス自体は/m配下ではない）にいる間は誤判定していた（会話ログ「ヘッダーの
// タイトルを押したときもPC画面に飛びます」参照）。/mまたは/map（どちらも
// 一方の文脈でしか使われない、曖昧さの無いページ）へ来た時だけ「直近どちらの
// 文脈にいたか」を記録しておき、共有ページではその値をそのまま引き継ぐ
// （共有ページ自体ではlastSectionを書き換えない）ことで解決する。
export const NAV_COUNT_STORAGE_KEY = "appNavCount";
export const LAST_SECTION_STORAGE_KEY = "lastSection";
export type Section = "mobile" | "desktop";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function NavigationTracker() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const current = Number(sessionStorage.getItem(NAV_COUNT_STORAGE_KEY) ?? "0");
      sessionStorage.setItem(NAV_COUNT_STORAGE_KEY, String(current + 1));

      if (pathname === "/m" || pathname?.startsWith("/m/")) {
        sessionStorage.setItem(LAST_SECTION_STORAGE_KEY, "mobile" satisfies Section);
      } else if (pathname === "/map" || pathname?.startsWith("/map/")) {
        sessionStorage.setItem(LAST_SECTION_STORAGE_KEY, "desktop" satisfies Section);
      }
      // それ以外（/ledgers・/facility-list・/inspections・/settings等の共有/PC専用
      // ページ）はlastSectionを書き換えない。
    } catch {
      // sessionStorageが使えない環境（プライベートブラウズ等）では記録を諦める
      // （BackLink・HeaderHomeLink側は記録が無ければ安全側のfallback・既定値に倒れる）。
    }
  }, [pathname]);

  return null;
}
