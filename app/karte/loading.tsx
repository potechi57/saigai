// /karte以下の全ルート（検索・一覧、カルテ詳細、編集画面等）で共有するローディング
// フォールバック（App Routerの規約で、より具体的なloading.tsxが無いサブルートにも
// 継承される）。DBへの再フェッチが終わるまでNext.jsが自動的にこれを表示するため、
// 検索条件を変えて再送信したときや、別のカルテへ遷移したときに画面が何も変わらず
// 「止まったのか」と誤解されることを防げる。
//
// 検索画面（app/karte/page.tsx）自体の検索・条件クリア・最近の検索については、
// これに加えてSearchSubmitButton（useFormStatus）・PendingLink（useLinkStatus）で
// クリックした要素自体に即座のフィードバックも出している。このloading.tsxは
// /karte配下の全ルート共通のフォールバックのため、検索画面固有のレイアウトに
// 寄せた見た目にはしていない（カルテ詳細・編集画面等では見た目が合わなくなるため）。
export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700 dark:border-gray-600 dark:border-t-gray-200" />
        読み込み中...
      </div>
    </div>
  );
}
