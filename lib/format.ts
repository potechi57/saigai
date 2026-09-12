// 日時表示の共通ヘルパー。
//
// `Date.prototype.toLocaleString("ja-JP")`はロケール（曜日区切り等の表記スタイル）を
// 指定するだけで、タイムゾーンは実行環境（サーバーレス関数の実行環境。Vercelでは
// 既定でUTC）のものが使われる。日本向けの業務システムでは常に日本時間で
// 表示したいため、`timeZone: "Asia/Tokyo"`を明示するヘルパーに統一する
// （個々の呼び出し箇所でオプションを書き忘れるとUTC表示に戻ってしまうため）。
export function formatJstDateTime(date: Date): string {
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export function formatJstDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}
