import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL } from "@/lib/labels";
import MapView, { type MapKarte } from "@/components/MapLoader";

export const dynamic = "force-dynamic";

// 地図検索画面（指示書7章）。
// 必須機能: マーカー表示・現在地表示・ズーム・地図移動・マーカー選択・簡易情報表示・詳細への遷移
// （実装はMapView参照）。「点検結果によるマーカー表示の違い」は対応区分の色分け、
// 「色だけに依存しないUI」は各マーカー内の短い記号（急/注/良/済等）で満たす。
export default async function KarteMapPage() {
  const allKartes = await prisma.karte.findMany({
    select: {
      id: true,
      facilityNo: true,
      routeName: true,
      karteType: true,
      responseCategory: true,
      latitude: true,
      longitude: true,
    },
  });

  const withCoords: MapKarte[] = allKartes
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

  const withoutCoordsCount = allKartes.length - withCoords.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">地図から探す</h1>
        <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          ← 検索・一覧に戻る
        </Link>
      </div>

      {withCoords.length === 0 ? (
        <p className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-400 dark:text-gray-500">
          座標が登録されているカルテがありません。
        </p>
      ) : (
        <MapView kartes={withCoords} />
      )}

      {withoutCoordsCount > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          ※ 座標未登録のため地図に表示できないカルテが {withoutCoordsCount} 件あります（一覧からは確認できます）。
        </p>
      )}
    </div>
  );
}
