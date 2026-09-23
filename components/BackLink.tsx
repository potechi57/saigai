"use client";

// 画面上の「← ◯◯に戻る」リンク共通部品。
//
// 【経緯・なぜ必要か】従来は各画面が`<Link href="/map">`のように固定の遷移先へ
// 直接リンクしていた。そのため、例えば「調書詳細 → 設定画面 → 画面上の戻るボタン」
// と進むと、本来なら調書詳細に戻ってほしいのに、常に固定の遷移先（検索・一覧画面等）
// へ飛ばされてしまい、ブラウザ標準の「戻る」ボタンの挙動と食い違っていた
// （会話ログ「調書を確認している状態→設定画面へ移動→画面上の『検索画面に戻る』を
// 押す→検索画面へ戻される」参照）。
//
// 【方式】クリック時、実際にこのアプリ内の画面から遷移してきた場合は
// `router.back()`でブラウザの「戻る」と同じ挙動にする。検索・一覧画面のフィルタ条件は
// URLクエリに保持されているため（`app/map/page.tsx`参照）、これで検索条件も
// 保持されたまま正しく戻れる。一方、ブックマークや新規タブ等でこの画面を直接開いた
// 場合（戻る先が無い、または他サイトから来た場合）は、指定されたfallbackHref
// （従来どおりの固定の遷移先）へ移動する。
//
// 【「アプリ内から来たか」の判定方法】当初はdocument.referrerで判定していたが、
// Next.jsのクライアントサイド遷移（<Link>によるSPA的な画面遷移）ではブラウザが
// document.referrerを更新しないため、実際にアプリ内から遷移してきた場合でも
// 誤って「アプリ外から来た」と判定され、常にfallbackHrefへ飛んでしまう不具合が
// あった（会話ログ「スマホ用で何かしらの台帳から検索画面に戻った時に、必ずPC版の
// 画面に移動してしまう」参照。原因はドキュメントリファラーがSPA遷移では更新
// されないこと）。そのため、components/NavigationTracker.tsx（app/layout.tsxに
// 常駐）がsessionStorageに記録するページ遷移回数を見る方式に切り替えた。
// 1回でもこのタブ内でページ遷移していれば（＝2ページ目以降であれば）、
// アプリ内を移動してきたとみなしてrouter.back()を使う。
//
// `<a href={fallbackHref}>`をベースにしているため、JavaScript無効時やSSR直後の
// クリックでも壊れず、常に何らかの妥当な遷移先を持つ（プログレッシブエンハンスメント）。
import { useRouter } from "next/navigation";
import { NAV_COUNT_STORAGE_KEY } from "@/components/NavigationTracker";

export default function BackLink({
  fallbackHref,
  children,
  className = "text-sm text-blue-600 dark:text-blue-400 hover:underline",
}: {
  fallbackHref: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // 新規タブ等の標準操作は妨げない
    e.preventDefault();
    let cameFromThisApp = false;
    try {
      cameFromThisApp = Number(sessionStorage.getItem(NAV_COUNT_STORAGE_KEY) ?? "0") > 1;
    } catch {
      // sessionStorageが使えない環境では「戻り先なし」として安全側（fallbackHref）に倒れる。
    }
    if (cameFromThisApp) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <a href={fallbackHref} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
