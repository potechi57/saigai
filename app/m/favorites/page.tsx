import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

// 現場向けのお気に入り一覧（/mのヘッダーから遷移）。
//
// 【背景・会話ログより】「ここのヘッダーにお気に入り・閲覧履歴があると、一度
// 戻ってしまった際にすぐに戻れてよい」との要望への対応。PC版のお気に入り画面
// （/karte/favorites）はグループ管理・地図・テーブル等リッチな作りだが、
// お気に入り自体はKarte（防災カルテ）専用のデータモデル（prisma/schema.prisma
// のFavorite参照）のため、/m側は他の現場向け画面と同じシンプルな一覧
// （/mの検索結果と同じカードスタイル）だけにしている。
// PC版へリンクすると画面が崩れる問題（会話ログ参照）を避けるため、
// 各項目のリンク先は/m/[facilityNo]（現場向け詳細画面）にしている。
export default async function MobileFavoritesPage() {
  const favorites = await prisma.favorite.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      karte: {
        select: {
          facilityNo: true,
          karteType: true,
          routeName: true,
          locationDistrict: true,
          locationTown: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Link href="/m" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 検索に戻る
      </Link>
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">★ お気に入り</h1>

      {favorites.length === 0 ? (
        <p className="rounded border border-gray-300 bg-white p-6 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
          お気に入りに登録されたカルテがありません。カルテ詳細画面の☆ボタンから追加できます。
        </p>
      ) : (
        <ul className="space-y-2">
          {favorites.map(({ karte: k }) => (
            <li key={k.facilityNo}>
              <Link
                href={`/m/${k.facilityNo}`}
                className="block rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
              >
                <p className="font-semibold text-gray-800 dark:text-gray-100">★ {k.facilityNo}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {KARTE_TYPE_LABEL[k.karteType] ?? k.karteType} ・ {k.routeName}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {[k.locationDistrict, k.locationTown].filter(Boolean).join(" ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
