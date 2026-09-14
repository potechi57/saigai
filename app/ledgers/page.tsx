import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { FACILITY_LEDGER_DOC_CLASS_LABEL, facilityLedgerDisplayName, formatFacilityType } from "@/lib/labels";
import { deleteFacilityLedger } from "@/lib/actions/facility-ledger-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

// トンネル台帳等、道路防災カルテ（Excel取込）とは別枠の、画像による台帳の一覧画面。
// Excelのような構造化データが無く、スキャン画像＋最低限の基本情報だけで登録されている
// （prisma/schema.prismaのFacilityLedgerコメント参照）。法令台帳・施設台帳の
// どちらの分類にも属しうる（docClassで区別。会話ログ参照。以前はこの画像登録＝
// 法令台帳と誤って対応付けていたが、実際にはトンネル台帳は施設台帳に属する）。
// 地図（/karte）にもピンとして表示される（緯度経度が登録されている場合のみ）。
// 1施設は複数枚の画像を持てるため（会話ログ参照）、カードには先頭（sortOrder最小）の
// 画像だけをサムネイルとして表示し、詳細（/ledgers/[id]）で全ての画像をタブ切替で見せる。
export default async function LedgersPage() {
  const ledgers = await prisma.facilityLedger.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      // サムネイルは先頭（sortOrder最小）の1枚だけでよいが、「画像n枚」の件数表示には
      // 全件数が要る。images配列をtake:1のままだと常に1件しか返らず「複数枚」の
      // 判定に使えないため、件数は別途_countで取得する。
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      _count: { select: { images: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 地図に戻る
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">台帳（画像）一覧</h1>
        {/* 分類（法令台帳／施設台帳）を指定せずに登録画面へ渡すと、フォーム側が
            「施設台帳」を無言でデフォルト選択してしまい、法令台帳のつもりで登録した
            台帳が施設台帳側に紛れ込む問題があった（会話ログ「法令台帳として登録した
            ものが、なぜか施設台帳に登録されているのかもしれません」参照）。
            資料読み込みハブ（app/import/page.tsx）と同じく、分類ごとに別のボタンに
            分けることで、登録前に必ずどちらかを意識して選んでもらう。 */}
        <div className="flex gap-2">
          <Link
            href="/ledgers/new?docClass=LEGAL"
            className="rounded bg-gray-800 px-4 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            ＋ 法令台帳として登録
          </Link>
          <Link
            href="/ledgers/new?docClass=FACILITY"
            className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            ＋ 施設台帳として登録
          </Link>
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Excelのような構造化データが無く、スキャン画像でしか残っていない台帳（トンネル台帳等）を、画像1枚と最低限の基本情報だけで登録します。緯度経度を入力すると、地図上にもピンで表示されます。
      </p>

      {ledgers.length === 0 ? (
        <p className="rounded border border-gray-300 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
          まだ登録された台帳はありません。
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ledgers.map((l) => {
            const displayName = facilityLedgerDisplayName(l.managementNo, l.name);
            const cover = l.images[0];
            return (
              <li key={l.id} className="overflow-hidden rounded border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
                <Link href={`/ledgers/${l.id}`}>
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover.imageUrl}
                      alt={displayName}
                      className="aspect-video w-full bg-gray-50 object-cover dark:bg-gray-800"
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-gray-50 text-xs text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                      画像なし
                    </div>
                  )}
                </Link>
                <div className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap gap-1">
                    <p className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {FACILITY_LEDGER_DOC_CLASS_LABEL[l.docClass] ?? l.docClass}
                    </p>
                    {formatFacilityType(l.facilityType, l.facilitySubType) && (
                      <p className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {formatFacilityType(l.facilityType, l.facilitySubType)}
                      </p>
                    )}
                    {l._count.images > 0 && (
                      <p className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        画像{l._count.images > 1 ? `${l._count.images}枚` : "1枚"}
                      </p>
                    )}
                  </div>
                  <p className="font-semibold text-gray-800 dark:text-gray-100">
                    <Link href={`/ledgers/${l.id}`} className="hover:underline">
                      {displayName}
                    </Link>
                  </p>
                  {l.routeName && <p className="text-gray-600 dark:text-gray-300">路線名: {l.routeName}</p>}
                  {l.location && <p className="text-gray-600 dark:text-gray-300">所在地: {l.location}</p>}
                  {l.latitude != null && l.longitude != null && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      緯度経度: {l.latitude.toString()}, {l.longitude.toString()}
                    </p>
                  )}
                  <form action={deleteFacilityLedger.bind(null, l.id)} className="pt-1">
                    <ConfirmSubmitButton
                      message={`「${displayName}」を削除しますか？（登録済みの画像も全て削除され、元に戻せません）`}
                      pendingLabel="削除中..."
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      削除
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
