"use client";

// 検索条件パネルに置く「検索結果を一覧で表示する」チェックボックス。
// 地図中心の画面設計（app/karte/page.tsx）では、この項目を通してのみ地図の代わりに
// 一覧表示に切り替えられるようにしている。
// GETフォームの中に置く通常のチェックボックスだが、チェック操作のたびに
// 「検索」ボタンを押さなくてもすぐ切り替わるよう、onChangeで自身の<form>を
// 自動送信する（他の検索条件はそのまま維持されて再送される）。
export default function ViewToggleField({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
      <input
        type="checkbox"
        name="view"
        value="list"
        defaultChecked={defaultChecked}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
      />
      検索結果を一覧で表示する
    </label>
  );
}
