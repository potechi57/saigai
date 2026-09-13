// 路線名先頭の「(国)」「(主)」等の前置き記号（路線の種別を表す慣用表記）。
// 自由入力のままだと、全角括弧「（一）」と半角括弧「(一)」等で表記ゆれが起き、
// 同じ路線が別の値として登録されてしまう恐れがあるため（会話ログ「()が全角か
// 半角かなどで別々に登録される恐れがあります」参照）、入力時は固定の選択肢から
// 選ばせ、保存時は必ず半角括弧で統一して組み立てる。
//
// 島根県の公共土木施設台帳で実際に使われている表記に合わせている
// （例:「(一)大野魚瀬恵曇線」＝一般県道）。網羅的な法令上の分類ではなく、
// 現場で実際に前置きとして使われる範囲に絞った、必要に応じて増やせる一覧。
export const ROUTE_PREFIX_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "なし（前置き無し）" },
  { value: "国", label: "国道 (国)" },
  { value: "主", label: "主要地方道 (主)" },
  { value: "一", label: "一般県道 (一)" },
  { value: "都", label: "都市計画道路 (都)" },
];

// 全角「（）」・半角「()」のどちらで入力されていても認識できるようにする
// （既存データの取り込み・編集フォームの初期値表示のため）。
const PREFIX_PATTERN = /^[（(]([^）)]{1,2})[）)]/;

// 既存のrouteName文字列から前置き記号と残りの部分を取り出す。前置きが
// ROUTE_PREFIX_OPTIONSに無い記号だった場合は、前置き無し（全体をrestとして
// 扱う）とする（未知の表記を誤って分解してしまわないため）。
export function parseRouteName(routeName: string | null | undefined): { prefix: string; rest: string } {
  const value = routeName ?? "";
  const m = value.match(PREFIX_PATTERN);
  if (m && ROUTE_PREFIX_OPTIONS.some((o) => o.value === m[1])) {
    return { prefix: m[1], rest: value.slice(m[0].length) };
  }
  return { prefix: "", rest: value };
}

// 前置き記号と本体から、保存用のrouteName文字列を組み立てる（常に半角括弧に
// 統一する）。前置きが未選択（空文字）の場合は本体のみ。本体も前置きも
// 空の場合はnullを返す（routeNameは任意項目のため）。
export function composeRouteName(prefix: string, rest: string): string | null {
  const trimmedRest = rest.trim();
  const trimmedPrefix = prefix.trim();
  if (!trimmedPrefix) return trimmedRest || null;
  return trimmedRest ? `(${trimmedPrefix})${trimmedRest}` : null;
}
