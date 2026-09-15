import Link from "next/link";
import Form from "next/form";
import { formatDistanceMeters } from "@/lib/geo";
import NearbySearchButton from "@/components/NearbySearchButton";
import { searchMobileByText, searchMobileNearby, MOBILE_RESULT_KIND_LABEL, type MobileSearchResult } from "@/lib/mobile-search";

export const dynamic = "force-dynamic";

// 「現在地から探す」の対象範囲（会話ログ「現在地から半径1キロのデータを確認できる
// 仕様」より）。
const NEARBY_RADIUS_M = 1000;
// 一覧に表示する上限件数（現在地検索・テキスト検索共通）。
const RESULT_LIMIT = 30;

// スマホ側の簡易ビュー（現場確認用）。当初はカルテ（防災カルテ）専用だったが、
// 「検索結果の一覧画面に法令台帳・施設台帳・点検調書のいずれの情報についても
// 取得できるようにしておいてください」との要望を受け、lib/mobile-search.tsで
// 4テーブルを横断検索するようにした（詳細はそちらのコメント参照）。
// PC側（/karte以下）のような検索条件・地図・様式再現等のリッチな機能は
// 持たせておらず、「検索→その場で撮った写真を確認する」という現場での用途に
// 絞っている。認証機能はこのMVP全体に無いため、ここでも追加していない
// （PC側と同じ開放範囲）。
export default async function MobileHomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; lat?: string; lng?: string; acc?: string }>;
}) {
  const { q, lat, lng, acc } = await searchParams;

  // 現在地検索（NearbySearchButton）からの遷移かどうか。lat/lngが揃っている場合は
  // テキスト検索より優先する（同一画面に両方の結果を混在させると分かりにくいため、
  // 片手操作で完結する/mではモードを1つに絞る方針にした）。
  const nearbyLat = lat ? Number(lat) : NaN;
  const nearbyLng = lng ? Number(lng) : NaN;
  const isNearbyMode = Number.isFinite(nearbyLat) && Number.isFinite(nearbyLng);
  const accuracyM = acc ? Number(acc) : null;

  // スマホのソフトキーボード・自動補完で前後に空白が混じりやすいため、
  // 検索前にトリムする（末尾の全角/半角スペースが残ると、実在する施設番号でも
  // 「見つかりませんでした」になってしまうため）。
  const trimmedQ = q?.trim();

  let results: MobileSearchResult[] = [];
  let totalBeforeTruncate = 0;

  if (isNearbyMode) {
    const withDistance = await searchMobileNearby(nearbyLat, nearbyLng, NEARBY_RADIUS_M);
    totalBeforeTruncate = withDistance.length;
    results = withDistance.slice(0, RESULT_LIMIT);
  } else if (trimmedQ) {
    // 現場では「施設管理番号を正確に覚えていない」ことも多いため、施設管理番号だけで
    // なく、路線名・位置目印・所在地（郡市〜町村／大字等）のいずれかに部分一致すれば
    // ヒットする単一の検索欄にしている（会話ログ「路線から検索できるように」より）。
    // PC側（/karte）は分野横断の多条件フォームだが、/mは片手操作を優先し、
    // 項目を分けず1つの入力欄でOR検索する方針にした。
    const all = await searchMobileByText(trimmedQ);
    totalBeforeTruncate = all.length;
    results = all.slice(0, RESULT_LIMIT);
  }

  const hasResultsSection = isNearbyMode || trimmedQ;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">現場確認</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        施設管理番号・路線名・所在地のいずれかの一部を入力して検索してください（カルテ・法令台帳・施設台帳・点検調書を横断して検索します）。
      </p>
      <Form action="" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="例: SAMPLE-0001 / 国道9号 / 松江市"
          className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <button
          type="submit"
          className="rounded bg-gray-800 px-4 py-2 text-sm text-white dark:bg-gray-700"
        >
          検索
        </button>
      </Form>

      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        または
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      </div>
      <NearbySearchButton />

      {isNearbyMode && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            📍 現在地から半径1km以内（{totalBeforeTruncate}件）
          </h2>
          {/* GPSの誤差が大きい場合（屋内・山間部等）、実際にはもう少し離れている／
              近い可能性があることを伝える。日本の一般的なスマホGPSでは平常時
              数m〜数十mだが、電波状況次第で数百mになることもあるため、
              100mを目安にした（厳密な閾値の根拠は無く、経験則）。 */}
          {accuracyM != null && accuracyM > 100 && (
            <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-400">
              ⚠ 現在地の取得精度が低い可能性があります（誤差 約{accuracyM}m）。実際の位置とずれることがあります。
            </p>
          )}
        </div>
      )}

      {hasResultsSection && (
        <ul className="space-y-2">
          {/* 各テーブル個別のtakeで打ち切っているため、路線名等で広くヒットする
              検索語だと全件ではない可能性がある。気づかず「これで全部」と誤解
              しないよう明示する（現在地検索・テキスト検索とも、絞り込み後の
              正確な合計件数が分かっているため、その値で判定する）。 */}
          {totalBeforeTruncate > RESULT_LIMIT && (
            <li className="rounded border border-yellow-300 bg-yellow-50 p-2 text-center text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
              先頭{RESULT_LIMIT}件のみ表示しています。絞り込めない場合は、より詳しい語句（管理番号等）で再検索してください。
            </li>
          )}
          {results.map((r) => (
            <li key={r.key}>
              <Link
                href={r.href}
                className="block rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
              >
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {MOBILE_RESULT_KIND_LABEL[r.kind]}
                  </span>
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{r.title}</span>
                  {r.distanceM != null && (
                    <span className="font-normal text-blue-600 dark:text-blue-400">
                      📍 {formatDistanceMeters(r.distanceM)}
                    </span>
                  )}
                </p>
                {r.subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{r.subtitle}</p>}
                {r.location && <p className="text-xs text-gray-400 dark:text-gray-500">{r.location}</p>}
              </Link>
            </li>
          ))}
          {results.length === 0 && (
            <li className="rounded border border-gray-300 bg-white p-4 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
              {isNearbyMode
                ? "現在地から半径1km以内にデータが見つかりませんでした。"
                : "該当するデータが見つかりませんでした。"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
