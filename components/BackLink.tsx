"use client";

// 画面上の「← ◯◯に戻る」リンク共通部品。
//
// 【経緯・なぜ必要か】従来は各画面が`<Link href="/karte">`のように固定の遷移先へ
// 直接リンクしていた。そのため、例えば「調書詳細 → 設定画面 → 画面上の戻るボタン」
// と進むと、本来なら調書詳細に戻ってほしいのに、常に固定の遷移先（検索・一覧画面等）
// へ飛ばされてしまい、ブラウザ標準の「戻る」ボタンの挙動と食い違っていた
// （会話ログ「調書を確認している状態→設定画面へ移動→画面上の『検索画面に戻る』を
// 押す→検索画面へ戻される」参照）。
//
// 【方式】クリック時、実際にこのアプリ内の画面から遷移してきた場合
// （`document.referrer`が同一オリジン、かつブラウザ履歴が実際に存在する場合）は
// `router.back()`でブラウザの「戻る」と同じ挙動にする。検索・一覧画面のフィルタ条件は
// URLクエリに保持されているため（`app/karte/page.tsx`参照）、これで検索条件も
// 保持されたまま正しく戻れる。一方、ブックマークや新規タブ等でこの画面を直接開いた
// 場合（戻る先が無い、または他サイトから来た場合）は、指定されたfallbackHref
// （従来どおりの固定の遷移先）へ移動する。
//
// `<a href={fallbackHref}>`をベースにしているため、JavaScript無効時やSSR直後の
// クリックでも壊れず、常に何らかの妥当な遷移先を持つ（プログレッシブエンハンスメント）。
import { useRouter } from "next/navigation";

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
    const cameFromThisApp =
      typeof window !== "undefined" &&
      window.history.length > 1 &&
      document.referrer &&
      new URL(document.referrer).origin === window.location.origin;
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
