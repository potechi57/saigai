import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteBridgeInspection } from "@/lib/actions/bridge-inspection-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

const JUDGMENT_BADGE: Record<string, string> = {
  Ⅰ: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  Ⅱ: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  Ⅲ: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  Ⅳ: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

// 点検調書（道路＞橋梁）の一覧画面（components/GateSignInspectionImportForm.tsxと
// 対になる一覧。app/inspections/gate-signs/page.tsxと同じ構成）。施設台帳
// （FacilityListItem）とは別テーブルだが、管理番号で紐付いている場合はリンクを出す。
export default async function BridgeInspectionListPage() {
  const inspections = await prisma.bridgeInspection.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      photos: { orderBy: { sortOrder: "asc" }, take: 1 },
      facilityListItem: { select: { id: true, managementNo: true } },
      _count: { select: { members: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <BackLink fallbackHref="/karte">
        ← 地図に戻る
      </BackLink>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">点検調書（橋梁）一覧</h1>
        <Link
          href="/inspections/bridges/import"
          className="rounded bg-gray-800 px-4 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          ＋ Excelを取り込む
        </Link>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        「別紙２　様式１様式２」形式の橋梁定期点検調書Excelを取り込んだ一覧です。管理番号で施設台帳（橋梁）と紐付いているものは、そちらの詳細ページへのリンクも表示します。
      </p>

      {inspections.length === 0 ? (
        <p className="rounded border border-gray-300 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
          まだ取り込まれた点検調書はありません。
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {inspections.map((insp) => {
            const cover = insp.photos[0];
            const title = insp.bridgeName ?? insp.managementNo ?? insp.sourceFileName ?? "（橋梁名不明）";
            return (
              <li key={insp.id} className="overflow-hidden rounded border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
                <Link href={`/inspections/bridges/${insp.id}`}>
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover.url}
                      alt={title}
                      className="aspect-video w-full bg-gray-50 object-cover dark:bg-gray-800"
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-gray-50 text-xs text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                      画像なし
                    </div>
                  )}
                </Link>
                <div className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-1">
                    {insp.overallJudgment && (
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs ${JUDGMENT_BADGE[insp.overallJudgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
                      >
                        判定区分 {insp.overallJudgment}
                      </span>
                    )}
                    {insp.spanCount != null && (
                      <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {insp.spanCount}径間
                      </span>
                    )}
                    <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      損傷 {insp._count.members}件
                    </span>
                  </div>
                  <p className="font-semibold text-gray-800 dark:text-gray-100">
                    <Link href={`/inspections/bridges/${insp.id}`} className="hover:underline">
                      {title}
                    </Link>
                  </p>
                  {insp.managementNo && <p className="text-gray-600 dark:text-gray-300">管理番号: {insp.managementNo}</p>}
                  {insp.routeName && <p className="text-gray-600 dark:text-gray-300">路線名: {insp.routeName}</p>}
                  {insp.location && <p className="text-gray-600 dark:text-gray-300">所在地: {insp.location}</p>}
                  {insp.inspectionDate && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      点検日: {new Date(insp.inspectionDate).toLocaleDateString("ja-JP")}
                    </p>
                  )}
                  {insp.facilityListItem ? (
                    <Link
                      href={`/facility-list/${insp.facilityListItem.id}`}
                      className="block text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      施設台帳（{insp.facilityListItem.managementNo}）を見る →
                    </Link>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">施設台帳と未紐付け（管理番号不一致）</p>
                  )}
                  <form action={deleteBridgeInspection.bind(null, insp.id)} className="pt-1">
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
