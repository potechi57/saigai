import Link from "next/link";
import { type Prisma, KarteType, ResponseCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL, responseMeta, RESPONSE_META } from "@/lib/labels";
import KarteResultsTabs from "@/components/KarteResultsTabs";
import type { MapKarte } from "@/components/MapLoader";

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
};

// 検索画面（指示書6章）・カルテ一覧画面（8章）・地図検索画面（7章）を1画面に統合している。
// 指示書19章「これらを16個の完全に独立したページとして実装する必要はない」の方針に沿う。
// 検索フォームを1つに共有し、結果を「一覧」「地図」タブで切り替える（KarteResultsTabs）。
// 従来は地図が検索条件を無視してDB全件を表示していた（実質バグ）が、統合により解消。
export default async function KarteListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

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
  if (params.location) {
    where.OR = [
      { locationDistrict: { contains: params.location, mode: "insensitive" } },
      { locationTown: { contains: params.location, mode: "insensitive" } },
    ];
  }
  // <select>のoption値はKARTE_TYPE_LABEL/RESPONSE_METAのキー（＝enumのメンバー名そのもの）
  // からしか生成していないため、想定外の値が来ることはない前提でキャストする。
  if (params.karteType && params.karteType in KarteType) {
    where.karteType = params.karteType as KarteType;
  }
  if (params.responseCategory && params.responseCategory in ResponseCategory) {
    where.responseCategory = params.responseCategory as ResponseCategory;
  }

  const hasCondition = Object.keys(params).some((k) => params[k as keyof SearchParams]);

  // 路線名は自由入力だと表記ゆれ（全角/半角、送り仮名等）で検索漏れが起きやすいため、
  // 実際に登録されている路線名から選ぶセレクトボックスにしている（フィルタ条件に関わらず
  // 全カルテから候補を集める。「今の検索結果に無い路線名」も選べた方が使い勝手が良いため）。
  const routeNameRows = await prisma.karte.findMany({
    distinct: ["routeName"],
    select: { routeName: true },
    orderBy: { routeName: "asc" },
  });
  const routeNameOptions = routeNameRows.map((r) => r.routeName).filter(Boolean);

  const kartes = await prisma.karte.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      targets: { select: { id: true } },
      events: {
        orderBy: { inspectionDate: "desc" },
        take: 1,
        select: { inspectionDate: true },
      },
    },
  });

  // 地図タブ用データ。検索フォームと同じ絞り込み結果からそのまま作る
  // （地図だけ別条件になってしまっていた従来の問題を防ぐ）。
  const mapKartes: MapKarte[] = kartes
    .filter((k) => k.latitude != null && k.longitude != null)
    .map((k) => ({
      id: k.id,
      facilityNo: k.facilityNo,
      routeName: k.routeName,
      karteTypeLabel: KARTE_TYPE_LABEL[k.karteType] ?? k.karteType,
      responseCategory: k.responseCategory,
      latitude: Number(k.latitude),
      longitude: Number(k.longitude),
    }));
  const withoutCoordsCount = kartes.length - mapKartes.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">カルテ検索・一覧</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/karte/import" className="text-blue-600 dark:text-blue-400 hover:underline">
            Excelから取込 →
          </Link>
          <Link href="/karte/new" className="rounded bg-gray-800 dark:bg-gray-700 px-3 py-1.5 text-white hover:bg-gray-700 dark:hover:bg-gray-600">
            ＋ 新規カルテ登録
          </Link>
        </div>
      </div>

      <form className="grid grid-cols-1 gap-3 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 sm:grid-cols-2 md:grid-cols-3">
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
        <div className="flex items-end gap-2 sm:col-span-2 md:col-span-3">
          <button type="submit" className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-1.5 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600">
            検索
          </button>
          {hasCondition && (
            <Link href="/karte" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
              条件をクリア
            </Link>
          )}
        </div>
      </form>

      <KarteResultsTabs count={kartes.length} mapKartes={mapKartes} withoutCoordsCount={withoutCoordsCount}>
        <div className="overflow-x-auto rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700 text-left text-gray-600 dark:text-gray-300">
              <tr>
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
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                    {hasCondition
                      ? "条件に一致するカルテがありません。"
                      : <>データがありません。<code>npm run db:seed</code> でサンプルデータを投入してください。</>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </KarteResultsTabs>
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
