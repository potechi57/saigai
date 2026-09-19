import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL, responseMeta } from "@/lib/labels";
import MapView from "@/components/MapLoader";
import type { MapKarte, MapGateSignInspection, HomeLocation } from "@/components/MapLoader";
import CreateFavoriteGroupForm from "@/components/CreateFavoriteGroupForm";
import FavoriteGroupsForm from "@/components/FavoriteGroupsForm";
import FavoriteToggleButton from "@/components/FavoriteToggleButton";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { deleteFavoriteGroup } from "@/lib/actions/favorite-actions";
import { getStartEndRecordPhotos } from "@/lib/map-photos";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// お気に入り画面（ヘッダーの「★ お気に入り」から遷移）。
// 「お気に入りに該当する場所を確認できる」「調書を一覧表示できる」「グルーピングできる」の
// 3点をこの1画面にまとめている: 上段にグループ管理（作成・絞り込みタブ）、
// 中段に該当する場所を確認できる地図、下段に調書の一覧テーブルという構成。
//
// 当初は防災カルテ（Karte）専用だったが、「お気に入り追加はカルテのみでは
// 意味がありません。点検調書の項目すべてに適用できるようにしてください」との
// 指摘を受け、門型標識点検調書（GateSignInspection）のお気に入りも同じ画面で
// 確認・グループ分けできるよう一般化した（prisma/schema.prismaのFavoriteモデル
// コメント参照）。1件のFavoriteはkarte/gateSignInspectionのどちらか一方だけを
// 持つため、一覧表示・地図表示ともf.karte/f.gateSignInspectionの有無で分岐する。
export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { group: groupId } = await searchParams;

  const [groups, favorites, totalFavoritesCount, settings] = await Promise.all([
    prisma.favoriteGroup.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.favorite.findMany({
      where: groupId ? { groupItems: { some: { groupId } } } : {},
      orderBy: { createdAt: "desc" },
      include: {
        karte: {
          include: {
            // 地図ポップアップの「最終点検日時」表示用（app/karte/page.tsxと同じ考え方）
            events: { orderBy: { inspectionDate: "desc" }, take: 1, select: { inspectionDate: true } },
          },
        },
        gateSignInspection: {
          include: {
            overviewPhotos: { orderBy: { sortOrder: "asc" } },
            facilityListItem: { select: { id: true } },
          },
        },
        groupItems: { include: { group: true } },
      },
    }),
    prisma.favorite.count(),
    prisma.appSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  const home: HomeLocation =
    settings?.homeLatitude != null && settings?.homeLongitude != null
      ? {
          latitude: Number(settings.homeLatitude),
          longitude: Number(settings.homeLongitude),
          label: settings.homeLabel,
        }
      : null;

  const karteFavorites = favorites.filter((f) => f.karte != null);
  const gateSignFavorites = favorites.filter((f) => f.gateSignInspection != null);

  const favoritesWithCoords = karteFavorites.filter((f) => f.karte!.latitude != null && f.karte!.longitude != null);
  // マーカーのポップアップに表示する、起点／終点の参考写真。lib/map-photos.ts参照。
  const startEndPhotos = await getStartEndRecordPhotos(favoritesWithCoords.map((f) => f.karte!.id));
  const mapKartes: MapKarte[] = favoritesWithCoords.map((f) => {
    const k = f.karte!;
    return {
      id: k.id,
      facilityNo: k.facilityNo,
      routeName: k.routeName,
      karteTypeLabel: KARTE_TYPE_LABEL[k.karteType] ?? k.karteType,
      responseCategory: k.responseCategory,
      latitude: Number(k.latitude),
      longitude: Number(k.longitude),
      isFavorite: true,
      startPhotoUrl: startEndPhotos.get(k.id)?.startPhotoUrl,
      endPhotoUrl: startEndPhotos.get(k.id)?.endPhotoUrl,
      extensionLengthM: k.extensionLengthM != null ? Number(k.extensionLengthM) : null,
      location: [k.locationDistrict, k.locationTown].filter(Boolean).join(" ") || null,
      lastInspectionDateLabel: k.events[0]?.inspectionDate
        ? new Date(k.events[0].inspectionDate).toLocaleDateString("ja-JP")
        : null,
    };
  });

  const gateSignFavoritesWithCoords = gateSignFavorites.filter(
    (f) => f.gateSignInspection!.latitude != null && f.gateSignInspection!.longitude != null
  );
  const mapGateSignInspections: MapGateSignInspection[] = gateSignFavoritesWithCoords.map((f) => {
    const g = f.gateSignInspection!;
    return {
      id: g.id,
      title: g.managementNo ?? g.sourceFileName ?? "（管理番号不明）",
      routeName: g.routeName,
      location: g.location,
      judgment: g.overallJudgment,
      inspectionDateLabel: g.inspectionDate ? new Date(g.inspectionDate).toLocaleDateString("ja-JP") : null,
      latitude: Number(g.latitude),
      longitude: Number(g.longitude),
      overviewPhotos: g.overviewPhotos.map((p) => ({ url: p.url, caption: p.caption })),
      facilityListItemId: g.facilityListItem?.id ?? null,
      isFavorite: true,
    };
  });

  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));
  const currentGroupName = groupId ? groups.find((g) => g.id === groupId)?.name : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <BackLink fallbackHref="/karte">
        ← 地図に戻る
      </BackLink>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">★ お気に入り</h1>

      <section className="space-y-3 rounded border border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">グループ</h2>
        <CreateFavoriteGroupForm />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/karte/favorites"
            className={`rounded px-2.5 py-1 ${
              !groupId
                ? "bg-gray-800 text-white dark:bg-gray-700"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            すべて（{totalFavoritesCount}）
          </Link>
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-1">
              <Link
                href={`/karte/favorites?group=${g.id}`}
                className={`rounded px-2.5 py-1 ${
                  groupId === g.id
                    ? "bg-gray-800 text-white dark:bg-gray-700"
                    : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {g.name}（{g._count.items}）
              </Link>
              <form action={deleteFavoriteGroup.bind(null, g.id)}>
                <ConfirmSubmitButton
                  message={`グループ「${g.name}」を削除しますか？（グループ分けが解除されるだけで、お気に入り自体は消えません）`}
                  pendingLabel="削除中..."
                  className="text-xs text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
                >
                  ×
                </ConfirmSubmitButton>
              </form>
            </div>
          ))}
        </div>
        {groups.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            グループはまだありません。作らなくても、下の一覧からお気に入りを外したり確認したりできます。
          </p>
        )}
      </section>

      <section className="h-[420px] overflow-hidden rounded border border-gray-300 dark:border-gray-700">
        {mapKartes.length === 0 && mapGateSignInspections.length === 0 ? (
          <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-400 dark:bg-gray-900 dark:text-gray-500">
            座標が登録されているお気に入りがありません。
          </div>
        ) : (
          <MapView kartes={mapKartes} gateSignInspections={mapGateSignInspections} home={home} />
        )}
      </section>

      <section className="rounded border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-300 px-4 py-2 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            調書一覧{currentGroupName ? `（${currentGroupName}）` : ""} — {favorites.length}件
          </h2>
        </div>
        {favorites.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
            {groupId ? "このグループにはお気に入りがありません。" : "お気に入りがまだありません。カルテ詳細画面や点検調書詳細画面の「☆ お気に入りに追加」から登録できます。"}
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {favorites.map((f) => {
              if (f.karte) {
                const k = f.karte;
                const resp = responseMeta(k.responseCategory);
                return (
                  <li key={f.id} className="space-y-1.5 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <Link href={`/karte/${k.facilityNo}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                          {k.routeName}
                        </Link>
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{k.facilityNo}</span>
                        <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${resp.badgeColor}`}>{resp.label}</span>
                      </div>
                      <FavoriteToggleButton
                        target={{ type: "karte", id: k.id, facilityNo: k.facilityNo }}
                        initialIsFavorite
                      />
                    </div>
                    <FavoriteGroupsForm
                      favoriteId={f.id}
                      groups={groupOptions}
                      selectedGroupIds={f.groupItems.map((gi) => gi.groupId)}
                    />
                  </li>
                );
              }
              if (f.gateSignInspection) {
                const g = f.gateSignInspection;
                const title = g.managementNo ?? g.sourceFileName ?? "（管理番号不明）";
                return (
                  <li key={f.id} className="space-y-1.5 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <Link
                          href={`/inspections/gate-signs/${g.id}`}
                          className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {title}
                        </Link>
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">門型標識</span>
                        {g.overallJudgment && (
                          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            判定区分 {g.overallJudgment}
                          </span>
                        )}
                      </div>
                      <FavoriteToggleButton
                        target={{ type: "gateSignInspection", id: g.id }}
                        initialIsFavorite
                      />
                    </div>
                    <FavoriteGroupsForm
                      favoriteId={f.id}
                      groups={groupOptions}
                      selectedGroupIds={f.groupItems.map((gi) => gi.groupId)}
                    />
                  </li>
                );
              }
              return null;
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
