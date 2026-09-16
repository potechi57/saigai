import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteBridgeLedger } from "@/lib/actions/bridge-ledger-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

// 橋梁台帳の一覧画面（会話ログ参照）。app/inspections/gate-signs/page.tsxと
// 同じ構成。施設台帳（FacilityListItem）とは別テーブルだが、管理番号で
// 紐付いている場合はリンクを出す。
export default async function BridgeLedgerListPage() {
  const bridges = await prisma.bridgeLedger.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      facilityListItem: { select: { id: true, managementNo: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 地図に戻る
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">橋梁台帳一覧</h1>
        <Link
          href="/bridge-ledgers/import"
          className="rounded bg-gray-800 px-4 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          ＋ Excelを取り込む
        </Link>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        橋梁台帳Excel（橋梁調書・橋梁台帳・画像・付属図）を取り込んだ一覧です。管理番号で施設台帳（橋梁）と紐付いているものは、そちらの詳細ページへのリンクも表示します。
      </p>

      {bridges.length === 0 ? (
        <p className="rounded border border-gray-300 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
          まだ取り込まれた橋梁台帳はありません。
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bridges.map((b) => {
            const title = b.bridgeName ?? b.managementNo ?? b.sourceFileName ?? "（橋名不明）";
            return (
              <li key={b.id} className="overflow-hidden rounded border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
                <div className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-1">
                    {b.managementNo && (
                      <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {b.managementNo}
                      </span>
                    )}
                    {b.bridgeType && (
                      <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {b.bridgeType}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-gray-800 dark:text-gray-100">
                    <Link href={`/bridge-ledgers/${b.id}`} className="hover:underline">
                      {title}
                    </Link>
                  </p>
                  {b.routeName && <p className="text-gray-600 dark:text-gray-300">路線名: {b.routeName}</p>}
                  {b.location && <p className="text-gray-600 dark:text-gray-300">所在地: {b.location}</p>}
                  {b.facilityListItem ? (
                    <Link
                      href={`/facility-list/${b.facilityListItem.id}`}
                      className="block text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      施設台帳（{b.facilityListItem.managementNo}）を見る →
                    </Link>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">施設台帳と未紐付け（管理番号不一致）</p>
                  )}
                  <form action={deleteBridgeLedger.bind(null, b.id)} className="pt-1">
                    <ConfirmSubmitButton
                      message={`「${title}」を削除しますか？（元に戻せません）`}
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
