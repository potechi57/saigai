import Link from "next/link";
import Form from "next/form";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL } from "@/lib/labels";
import { haversineDistanceMeters, formatDistanceMeters } from "@/lib/geo";
import NearbySearchButton from "@/components/NearbySearchButton";

export const dynamic = "force-dynamic";

// 「現在地から探す」の対象範囲（会話ログ「現在地から半径1キロのデータを確認できる
// 仕様」より）。
const NEARBY_RADIUS_M = 1000;

type KarteListItem = {
  facilityNo: string;
  karteType: string;
  routeName: string;
  locationDistrict: string | null;
  locationTown: string | null;
  distanceM?: number; // 現在地検索の場合のみ設定
};

// スマホ側の簡易ビュー（現場確認用）。PC側（/karte以下）のような検索条件・地図・
// 様式再現等のリッチな機能は持たせず、「施設管理番号で検索→その場で撮った写真を
// 確認する」という最小限の用途に絞っている（ユーザー要望「カルテデータの写真を
// 表示できればよい。PC版のようなリッチな機能は不要」に対応）。
// 認証機能はこのMVP全体に無いため、ここでも追加していない（PC側と同じ開放範囲）。
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

  let kartes: KarteListItem[] = [];
  let nearbyTotalBeforeTruncate = 0;

  if (isNearbyMode) {
    // 【技術選定・会話ログより】座標を持つカルテは現時点で127件と少数のため、
    // PostGIS等の専用の地理空間検索機能は導入せず、全件取得してサーバー側で
    // Haversine距離計算・絞り込みする方式にした（lib/geo.ts、MapView.tsxの
    // ホーム位置距離表示と同じ考え方）。件数が大幅に増えた場合は、緯度経度の
    // 範囲で先に絞り込む等の最適化を検討する。
    const candidates = await prisma.karte.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: {
        facilityNo: true,
        karteType: true,
        routeName: true,
        locationDistrict: true,
        locationTown: true,
        latitude: true,
        longitude: true,
      },
    });
    const withDistance = candidates
      .map((k) => ({
        ...k,
        distanceM: haversineDistanceMeters(nearbyLat, nearbyLng, Number(k.latitude), Number(k.longitude)),
      }))
      .filter((k) => k.distanceM <= NEARBY_RADIUS_M)
      .sort((a, b) => a.distanceM - b.distanceM);
    nearbyTotalBeforeTruncate = withDistance.length;
    kartes = withDistance.slice(0, 30);
  } else if (trimmedQ) {
    // 現場では「施設管理番号を正確に覚えていない」ことも多いため、施設管理番号だけで
    // なく、路線名・位置目印・所在地（郡市〜町村／大字等）のいずれかに部分一致すれば
    // ヒットする単一の検索欄にしている（会話ログ「路線から検索できるように」より）。
    // PC側（/karte）は分野横断の多条件フォームだが、/mは片手操作を優先し、
    // 項目を分けず1つの入力欄でOR検索する方針にした。
    //
    // 所在地はlocationDistrict（郡・市〜町村）とlocationTown（大字等）の2カラムに
    // 分かれているため、検索語がどちらか一方に収まっていればここで拾えるが、
    // 2カラムの境界をまたぐ語（例: districtの末尾〜townの先頭にまたがる地名の一部）は
    // 拾えない（/karteのJS側フィルタと同様の制限。詳細検索が必要な場合はPC版を案内する）。
    kartes = await prisma.karte.findMany({
      where: {
        OR: [
          { facilityNo: { contains: trimmedQ, mode: "insensitive" } },
          { routeName: { contains: trimmedQ, mode: "insensitive" } },
          { landmark: { contains: trimmedQ, mode: "insensitive" } },
          { locationDistrict: { contains: trimmedQ, mode: "insensitive" } },
          { locationTown: { contains: trimmedQ, mode: "insensitive" } },
        ],
      },
      orderBy: { facilityNo: "asc" },
      take: 30,
      select: { facilityNo: true, karteType: true, routeName: true, locationDistrict: true, locationTown: true },
    });
  }

  const hasResultsSection = isNearbyMode || trimmedQ;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">現場確認（写真）</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        施設管理番号・路線名・所在地のいずれかの一部を入力して検索してください。
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
            📍 現在地から半径1km以内（{nearbyTotalBeforeTruncate}件）
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
          {/* take:30で打ち切っているため、路線名等で広くヒットする検索語だと
              全件ではない可能性がある。気づかず「これで全部」と誤解しないよう明示する。
              現在地検索は絞り込み後の正確な件数が分かっているため、その値で判定する。 */}
          {(isNearbyMode ? nearbyTotalBeforeTruncate > 30 : kartes.length === 30) && (
            <li className="rounded border border-yellow-300 bg-yellow-50 p-2 text-center text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
              先頭30件のみ表示しています。絞り込めない場合は、より詳しい語句（施設管理番号等）で再検索してください。
            </li>
          )}
          {kartes.map((k) => (
            <li key={k.facilityNo}>
              <Link
                href={`/m/${k.facilityNo}`}
                className="block rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
              >
                <p className="font-semibold text-gray-800 dark:text-gray-100">
                  {k.facilityNo}
                  {k.distanceM != null && (
                    <span className="ml-2 font-normal text-blue-600 dark:text-blue-400">
                      📍 {formatDistanceMeters(k.distanceM)}
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {KARTE_TYPE_LABEL[k.karteType] ?? k.karteType} ・ {k.routeName}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {[k.locationDistrict, k.locationTown].filter(Boolean).join(" ")}
                </p>
              </Link>
            </li>
          ))}
          {kartes.length === 0 && (
            <li className="rounded border border-gray-300 bg-white p-4 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
              {isNearbyMode
                ? "現在地から半径1km以内にカルテが見つかりませんでした。"
                : "該当するカルテが見つかりませんでした。"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
