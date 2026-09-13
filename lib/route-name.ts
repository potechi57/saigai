// 路線名先頭の「（国）」「（主）」等の前置き記号（路線の種別を表す慣用表記）。
// 自由入力のままだと、全角括弧「（一）」と半角括弧「(一)」等で表記ゆれが起き、
// 同じ路線が別の値として登録されてしまう恐れがあるため（会話ログ「()が全角か
// 半角かなどで別々に登録される恐れがあります」参照）、入力時は固定の選択肢から
// 選ばせ、保存時は必ず統一した表記で組み立てる。
//
// 統一先は全角（括弧・数字とも）にしている。一覧表（Excel取込のFacilityListItem）
// から取り込まれる路線名は「（国）４３１号」のように括弧・数字とも全角で
// 統一されているため、画像読み取り（FacilityLedger）側もこれに合わせないと、
// 同じ路線が半角と全角の2通りの表記で別々に登録されてしまう
// （会話ログ「一覧表から取り込まれたものは、かっこも数字も全角のようです。
// したがって、画像読み取りの名前つけも全角に合わせるようにしてください」参照）。
//
// 島根県の公共土木施設台帳で実際に使われている表記に合わせている
// （例:「（一）大野魚瀬恵曇線」＝一般県道）。網羅的な法令上の分類ではなく、
// 現場で実際に前置きとして使われる範囲に絞った、必要に応じて増やせる一覧。
export const ROUTE_PREFIX_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "なし（前置き無し）" },
  { value: "国", label: "国道（国）" },
  { value: "主", label: "主要地方道（主）" },
  { value: "一", label: "一般県道（一）" },
  { value: "都", label: "都市計画道路（都）" },
];

// 全角「（）」・半角「()」のどちらで入力されていても認識できるようにする
// （既存データの取り込み・編集フォームの初期値表示のため）。
const PREFIX_PATTERN = /^[（(]([^）)]{1,2})[）)]/;

// 半角数字→全角数字の変換テーブル（0-9のみ。routeNameRestに含まれる路線番号
// 表記を、一覧表と同じ全角数字に統一するために使う）。
const HALF_TO_FULL_WIDTH_DIGITS: Record<string, string> = {
  "0": "０",
  "1": "１",
  "2": "２",
  "3": "３",
  "4": "４",
  "5": "５",
  "6": "６",
  "7": "７",
  "8": "８",
  "9": "９",
};

function toFullWidthDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => HALF_TO_FULL_WIDTH_DIGITS[d]);
}

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

// 前置き記号と本体から、保存用のrouteName文字列を組み立てる（常に全角括弧＋
// 全角数字に統一する。一覧表の表記に合わせるため）。前置きが未選択（空文字）の
// 場合は本体のみ。本体も前置きも空の場合はnullを返す（routeNameは任意項目のため）。
export function composeRouteName(prefix: string, rest: string): string | null {
  const trimmedRest = toFullWidthDigits(rest.trim());
  const trimmedPrefix = prefix.trim();
  if (!trimmedPrefix) return trimmedRest || null;
  return trimmedRest ? `（${trimmedPrefix}）${trimmedRest}` : null;
}
