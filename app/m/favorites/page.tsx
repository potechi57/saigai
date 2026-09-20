import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL, FACILITY_LEDGER_DOC_CLASS_LABEL, facilityLedgerDisplayName } from "@/lib/labels";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// 現場向けのお気に入り一覧（/mのヘッダーから遷移）。
//
// 【背景・会話ログより】「ここのヘッダーにお気に入り・閲覧履歴があると、一度
// 戻ってしまった際にすぐに戻れてよい」との要望への対応。PC版のお気に入り画面
// （/karte/favorites）はグループ管理・地図・テーブル等リッチな作りだが、
// /m側は他の現場向け画面と同じシンプルな一覧（/mの検索結果と同じカード
// スタイル）だけにしている。
//
// お気に入りは当初Karte（防災カルテ）専用だったが、「お気に入り追加はカルテ
// のみでは意味がありません。点検調書の項目すべてに適用できるようにして
// ください」との指摘を受け、点検調書（門型標識・橋梁）・台帳（橋梁台帳・
// 法令/施設台帳）にも一般化した（prisma/schema.prismaのFavoriteモデル
// コメント参照）。これらの種別には現状/m配下の専用画面が無いため、
// PC版の詳細画面へリンクする（施設台帳へのリンク等、他の場面でも/mから
// 直接PC版URLへリンクする箇所が既にあるのと同じ考え方）。
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
      gateSignInspection: {
        select: {
          id: true,
          managementNo: true,
          sourceFileName: true,
          routeName: true,
          location: true,
        },
      },
      bridgeInspection: {
        select: {
          id: true,
          bridgeName: true,
          managementNo: true,
          sourceFileName: true,
          routeName: true,
          location: true,
        },
      },
      bridgeLedger: {
        select: {
          id: true,
          bridgeName: true,
          managementNo: true,
          routeName: true,
          location: true,
        },
      },
      facilityLedger: {
        select: {
          id: true,
          docClass: true,
          managementNo: true,
          name: true,
          routeName: true,
          location: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <BackLink fallbackHref="/m">
        ← 検索に戻る
      </BackLink>
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">★ お気に入り</h1>

      {favorites.length === 0 ? (
        <p className="rounded border border-gray-300 bg-white p-6 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
          お気に入りに登録された調書がありません。カルテや点検調書・台帳の詳細画面の☆ボタンから追加できます。
        </p>
      ) : (
        <ul className="space-y-2">
          {favorites.map((f) => {
            if (f.karte) {
              const k = f.karte;
              return (
                <li key={`karte-${k.facilityNo}`}>
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
              );
            }
            if (f.gateSignInspection) {
              const g = f.gateSignInspection;
              const title = g.managementNo ?? g.sourceFileName ?? "（管理番号不明）";
              return (
                <li key={`gate-sign-${g.id}`}>
                  <Link
                    href={`/inspections/gate-signs/${g.id}`}
                    className="block rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <p className="font-semibold text-gray-800 dark:text-gray-100">★ {title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">門型標識 ・ {g.routeName}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{g.location}</p>
                  </Link>
                </li>
              );
            }
            if (f.bridgeInspection) {
              const b = f.bridgeInspection;
              const title = b.bridgeName ?? b.managementNo ?? b.sourceFileName ?? "（橋梁名不明）";
              return (
                <li key={`bridge-inspection-${b.id}`}>
                  <Link
                    href={`/inspections/bridges/${b.id}`}
                    className="block rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <p className="font-semibold text-gray-800 dark:text-gray-100">★ {title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">橋梁 ・ {b.routeName}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{b.location}</p>
                  </Link>
                </li>
              );
            }
            if (f.bridgeLedger) {
              const b = f.bridgeLedger;
              const title = b.bridgeName ?? b.managementNo ?? "（橋名不明）";
              return (
                <li key={`bridge-ledger-${b.id}`}>
                  <Link
                    href={`/bridge-ledgers/${b.id}`}
                    className="block rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <p className="font-semibold text-gray-800 dark:text-gray-100">★ {title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">橋梁台帳 ・ {b.routeName}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{b.location}</p>
                  </Link>
                </li>
              );
            }
            if (f.facilityLedger) {
              const l = f.facilityLedger;
              const title = facilityLedgerDisplayName(l.managementNo, l.name);
              return (
                <li key={`facility-ledger-${l.id}`}>
                  <Link
                    href={`/ledgers/${l.id}`}
                    className="block rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <p className="font-semibold text-gray-800 dark:text-gray-100">★ {title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {FACILITY_LEDGER_DOC_CLASS_LABEL[l.docClass] ?? l.docClass} ・ {l.routeName}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{l.location}</p>
                  </Link>
                </li>
              );
            }
            return null;
          })}
        </ul>
      )}
    </div>
  );
}
