import Link from "next/link";
import { type Prisma, KarteType, ResponseCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL, responseMeta, RESPONSE_META } from "@/lib/labels";
import MapView from "@/components/MapLoader";
import type { MapKarte, HomeLocation } from "@/components/MapLoader";
import SearchHistoryPanel from "@/components/SearchHistoryPanel";
import { getStartEndRecordPhotos } from "@/lib/map-photos";

// 点検記録は随時更新されるため静的プリレンダリングはせず、常に最新をDBから取得する
// （ビルド時にDBへ接続できない環境でもビルドが通るようにする副次効果もある）。
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string; // 施設管理番号／カルテ番号（同一フィールドのため一本化）
  routeName?: string;
  routeNo?: string;
  location?: string;
  karteType?: string;
  responseCategory?: string;
  view?: string; // "list" のときだけ地図の代わりに一覧表示にする（既定は地図）
};

// 「地図を中心とした画面」（ホーム画面）。指示書19章の方針に沿い、検索画面（6章）・
// カルテ一覧画面（8章）・地図検索画面（7章）を1画面に統合している。
//
// 以前は検索フォームの下に「一覧」「地図」タブを並べて表示していたが、
// 「地図を中心とした画面にしてほしい。初期表示は地図だけ、一覧は表示しない」
// という要望を受けて、次のレイアウトに刷新した:
//   - 画面いっぱい（ヘッダー直下〜画面下端）を使い、左に検索条件パネル、
//     中央（残り全体）に地図を常時表示する（PCでの基本レイアウト）。
//   - 初期表示（条件無し）では地図だけを見せ、カルテの一覧テーブルは出さない。
//     地図には現在の検索条件に一致するカルテのピンだけを最小限の情報で表示し、
//     詳細はピンをクリックした時のポップアップに追い出す（components/MapView.tsx）。
//   - 「一覧」表示に切り替えられる唯一の入り口は検索条件パネル内の
//     「検索結果を一覧で表示する」ボタン（検索ボタンと同じ<form>内の別の送信ボタン。
//     name="view"の値だけが異なる）。押すと地図の代わりにカルテ一覧テーブルを表示する。
export default async function KarteListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view: "map" | "list" = params.view === "list" ? "list" : "map";

  const where: Prisma.KarteWhereInput = {};
  if (params.q) {
    where.facilityNo = { contains: params.q, mode: "insensitive" };
  }
  if (params.routeName) {
    where.routeName = params.routeName;
  }
  if (params.routeNo) {
    where.routeNo = { contains: params.routeNo, mode: "insensitive" };
  }
  // 所在地はlocationDistrict（郡・市〜町村種別まで）とlocationTown（大字等）の2カラムに
  // 分けて格納しているが、一覧・検索条件では{district}{town}を結合した1つの文字列として
  // 見せている。locationDistrict/locationTownをそれぞれ別々にcontains検索すると、
  // 表示上の「所在地」欄でしか繋がらない検索語（districtの末尾〜townの先頭にまたがる語、
  // 例:"広瀬町 祖父谷"）を拾えない不具合があったため、DBのwhereでは絞り込まず、
  // 他の条件で絞り込んだ結果に対して結合済み文字列でJS側フィルタする（下記）。
  // <select>のoption値はKARTE_TYPE_LABEL/RESPONSE_METAのキー（＝enumのメンバー名そのもの）
  // からしか生成していないため、想定外の値が来ることはない前提でキャストする。
  if (params.karteType && params.karteType in KarteType) {
    where.karteType = params.karteType as KarteType;
  }
  if (params.responseCategory && params.responseCategory in ResponseCategory) {
    where.responseCategory = params.responseCategory as ResponseCategory;
  }

  const hasCondition = ["q", "routeName", "routeNo", "location", "karteType", "responseCategory"].some(
    (k) => params[k as keyof SearchParams]
  );

  // 路線名は自由入力だと表記ゆれ（全角/半角、送り仮名等）で検索漏れが起きやすいため、
  // 実際に登録されている路線名から選ぶセレクトボックスにしている（フィルタ条件に関わらず
  // 全カルテから候補を集める。「今の検索結果に無い路線名」も選べた方が使い勝手が良いため）。
  const [routeNameRows, settings] = await Promise.all([
    prisma.karte.findMany({
      distinct: ["routeName"],
      select: { routeName: true },
      orderBy: { routeName: "asc" },
    }),
    prisma.appSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  const routeNameOptions = routeNameRows.map((r) => r.routeName).filter(Boolean);

  const home: HomeLocation =
    settings?.homeLatitude != null && settings?.homeLongitude != null
      ? {
          latitude: Number(settings.homeLatitude),
          longitude: Number(settings.homeLongitude),
          label: settings.homeLabel,
        }
      : null;

  const kartesBeforeLocationFilter = await prisma.karte.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      targets: { select: { id: true } },
      events: {
        orderBy: { inspectionDate: "desc" },
        take: 1,
        select: { inspectionDate: true },
      },
      favorite: { select: { id: true } },
    },
  });

  // 所在地検索は上記コメントの通り、結合済み文字列に対するJS側フィルタで行う。
  const kartes = params.location
    ? kartesBeforeLocationFilter.filter((k) => {
        const combined = [k.locationDistrict, k.locationTown].filter(Boolean).join(" ").toLowerCase();
        return combined.includes(params.location!.toLowerCase());
      })
    : kartesBeforeLocationFilter;

  // 地図用データ。検索フォームと同じ絞り込み結果からそのまま作る
  // （地図だけ別条件になってしまっていた従来の問題を防ぐ）。
  const kartesWithCoords = kartes.filter((k) => k.latitude != null && k.longitude != null);
  // マーカーのポップアップに表示する、起点／終点の参考写真（現状記録写真のうち
  // キャプションに「起点」「終点」を含むもの）。lib/map-photos.ts参照。
  const startEndPhotos = await getStartEndRecordPhotos(kartesWithCoords.map((k) => k.id));
  const mapKartes: MapKarte[] = kartesWithCoords.map((k) => ({
    id: k.id,
    facilityNo: k.facilityNo,
    routeName: k.routeName,
    karteTypeLabel: KARTE_TYPE_LABEL[k.karteType] ?? k.karteType,
    responseCategory: k.responseCategory,
    latitude: Number(k.latitude),
    longitude: Number(k.longitude),
    isFavorite: k.favorite != null,
    startPhotoUrl: startEndPhotos.get(k.id)?.startPhotoUrl,
    endPhotoUrl: startEndPhotos.get(k.id)?.endPhotoUrl,
    extensionLengthM: k.extensionLengthM != null ? Number(k.extensionLengthM) : null,
    location: [k.locationDistrict, k.locationTown].filter(Boolean).join(" ") || null,
    lastInspectionDateLabel: k.events[0]?.inspectionDate
      ? new Date(k.events[0].inspectionDate).toLocaleDateString("ja-JP")
      : null,
  }));
  const withoutCoordsCount = kartes.length - mapKartes.length;

  // 「最近の検索」（左パネル下部）に記録する内容。表示方法（view）は検索条件では
  // ないため、記録対象からは除外する（一覧⇔地図の切替だけでは履歴を増やさない）。
  const historyParams = new URLSearchParams();
  if (params.q) historyParams.set("q", params.q);
  if (params.routeName) historyParams.set("routeName", params.routeName);
  if (params.routeNo) historyParams.set("routeNo", params.routeNo);
  if (params.location) historyParams.set("location", params.location);
  if (params.karteType) historyParams.set("karteType", params.karteType);
  if (params.responseCategory) historyParams.set("responseCategory", params.responseCategory);
  const currentQueryString = historyParams.toString();

  const conditionLabels: string[] = [];
  if (params.q) conditionLabels.push(`番号:${params.q}`);
  if (params.routeName) conditionLabels.push(`路線:${params.routeName}`);
  if (params.routeNo) conditionLabels.push(`路線番号:${params.routeNo}`);
  if (params.location) conditionLabels.push(`所在地:${params.location}`);
  if (params.karteType && params.karteType in KarteType) {
    conditionLabels.push(KARTE_TYPE_LABEL[params.karteType as KarteType] ?? params.karteType);
  }
  if (params.responseCategory && params.responseCategory in ResponseCategory) {
    conditionLabels.push(RESPONSE_META[params.responseCategory as ResponseCategory]?.label ?? params.responseCategory);
  }
  const currentSearchLabel = conditionLabels.length > 0 ? conditionLabels.join(" ・ ") : null;

  return (
    // ヘッダー(h-14)を除いた画面の残り全体を、左の検索条件パネルと中央の地図/一覧で
    // 分け合う（このページだけの都合のレイアウトのため、他ページのようなmx-auto
    // max-w-*や余白は持たせず、<main>にも一律のpaddingを付けていない。
    // app/layout.tsxのコメント参照）。
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 lg:w-96">
        <h1 className="mb-3 text-lg font-bold text-gray-800 dark:text-gray-100">カルテ検索</h1>
        <form className="space-y-3">
          <SearchField name="q" label="施設管理番号 / カルテ番号" defaultValue={params.q} />
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">路線名</label>
            <select
              name="routeName"
              defaultValue={params.routeName ?? ""}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">すべて</option>
              {routeNameOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <SearchField name="routeNo" label="路線番号" defaultValue={params.routeNo} />
          <SearchField name="location" label="所在地" defaultValue={params.location} />
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">カルテ区分</label>
            <select
              name="karteType"
              defaultValue={params.karteType ?? ""}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">すべて</option>
              {Object.entries(KARTE_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">対応区分</label>
            <select
              name="responseCategory"
              defaultValue={params.responseCategory ?? ""}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">すべて</option>
              {Object.entries(RESPONSE_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-3 dark:border-gray-700">
            {/* 検索ボタンと同じ<form>内の別の送信ボタン（name="view"）にすることで、
                クリックひとつでその場の条件のまま切り替わる（JS不要）。「検索」ボタン側にも
                同じ現在のviewを持たせているため、条件を変えて検索し直しても表示方法は
                維持される（そうしないと、一覧表示中に検索し直すたび地図表示に戻ってしまう）。 */}
            <button
              type="submit"
              name="view"
              value={view === "list" ? "map" : "list"}
              className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {view === "list" ? "地図で表示する" : "検索結果を一覧で表示する"}
            </button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" name="view" value={view} className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-1.5 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600">
              検索
            </button>
            {hasCondition && (
              <Link href="/karte" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
                条件をクリア
              </Link>
            )}
          </div>
        </form>

        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
          {hasCondition ? `検索結果 ${kartes.length} 件` : `全 ${kartes.length} 件を地図に表示中`}
          {withoutCoordsCount > 0 && `（うち座標未登録 ${withoutCoordsCount} 件は地図に表示できません）`}
        </p>

        <SearchHistoryPanel currentQuery={currentQueryString} currentLabel={currentSearchLabel} />
      </aside>

      <main className="relative flex-1 bg-gray-100 dark:bg-gray-950">
        {view === "list" ? (
          <div className="h-full overflow-y-auto p-4">
            <div className="overflow-x-auto rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700 text-left text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2">施設管理番号</th>
                    <th className="px-3 py-2">カルテ種別</th>
                    <th className="px-3 py-2">路線名</th>
                    <th className="px-3 py-2">所在地</th>
                    <th className="px-3 py-2">対象数</th>
                    <th className="px-3 py-2">最新点検日</th>
                    <th className="px-3 py-2">対応区分</th>
                  </tr>
                </thead>
                <tbody>
                  {kartes.map((k) => {
                    const resp = responseMeta(k.responseCategory);
                    return (
                      <tr key={k.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-3 py-2 text-yellow-500">{k.favorite ? "★" : ""}</td>
                        <td className="px-3 py-2">
                          <Link href={`/karte/${k.facilityNo}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {k.facilityNo}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{KARTE_TYPE_LABEL[k.karteType] ?? k.karteType}</td>
                        <td className="px-3 py-2">{k.routeName}</td>
                        <td className="px-3 py-2">
                          {[k.locationDistrict, k.locationTown].filter(Boolean).join(" ")}
                        </td>
                        <td className="px-3 py-2">{k.targets.length}</td>
                        <td className="px-3 py-2">
                          {k.events[0]?.inspectionDate
                            ? new Date(k.events[0].inspectionDate).toLocaleDateString("ja-JP")
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-2 py-0.5 text-xs ${resp.badgeColor}`}>{resp.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {kartes.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                        {hasCondition
                          ? "条件に一致するカルテがありません。"
                          : <>データがありません。<code>npm run db:seed</code> でサンプルデータを投入してください。</>}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <MapView kartes={mapKartes} home={home} allowSetHome />
        )}
      </main>
    </div>
  );
}

function SearchField({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{label}</label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
    </div>
  );
}
