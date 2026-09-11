import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { FACILITY_LEDGER_CATEGORY_LABEL } from "@/lib/labels";
import { deleteFacilityLedger } from "@/lib/actions/facility-ledger-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

// トンネル台帳等、道路防災カルテ（Excel取込）とは別枠の台帳の一覧画面。
// 橋梁・トンネル・シェッド・大型カルバート等は道路法施行規則に基づく法定点検
// （施設ごとに別の定期点検要領。構造物点検）の対象であり、現状はこのうちトンネルの
// 画像台帳のみ対応している。構造化データが無く、スキャン画像＋最低限の基本情報だけで
// 登録されている（prisma/schema.prismaのFacilityLedgerコメント参照）。地図（/karte）にも
// ピンとして表示される（緯度経度が登録されている場合のみ）。
export default async function LedgersPage() {
  const ledgers = await prisma.facilityLedger.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 地図に戻る
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">台帳（画像）一覧</h1>
        <Link
          href="/ledgers/new"
          className="rounded bg-gray-800 px-4 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          ＋ 新規登録
        </Link>
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
          {ledgers.map((l) => (
            <li key={l.id} className="overflow-hidden rounded border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
              <a href={l.imageUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.imageUrl} alt={l.name} className="aspect-video w-full bg-gray-50 object-cover dark:bg-gray-800" />
              </a>
              <div className="space-y-1 p-3 text-sm">
                <p className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 inline-block dark:bg-gray-800 dark:text-gray-300">
                  {FACILITY_LEDGER_CATEGORY_LABEL[l.category] ?? l.category}
                </p>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{l.name}</p>
                {l.routeName && <p className="text-gray-600 dark:text-gray-300">路線名: {l.routeName}</p>}
                {l.location && <p className="text-gray-600 dark:text-gray-300">所在地: {l.location}</p>}
                {l.latitude != null && l.longitude != null && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    緯度経度: {l.latitude.toString()}, {l.longitude.toString()}
                  </p>
                )}
                <form action={deleteFacilityLedger.bind(null, l.id)} className="pt-1">
                  <ConfirmSubmitButton
                    message={`「${l.name}」を削除しますか？（元に戻せません）`}
                    pendingLabel="削除中..."
                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                  >
                    削除
                  </ConfirmSubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
