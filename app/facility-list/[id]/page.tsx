import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatFacilityType } from "@/lib/labels";
import { buildFacilityRouteSearchHref } from "@/lib/facility-taxonomy";
import RecordViewHistory from "@/components/RecordViewHistory";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// 施設一覧（台帳）の1件詳細画面。施設諸元（台帳本体）と、管理番号で紐付いた
// 詳細な点検調書（GateSignInspection/BridgeInspection/BridgeLedger/
// SlopeStructureInspection）へのリンクを表示する。カルテ詳細画面
// （/map/[karteNo]）が様式Ａ〜Ｄという決まった様式を表形式で再現しているのに
// 対し、こちらはExcelの列をそのまま見せるだけの簡素な画面にとどめている
// （施設一覧データには様式が無いため）。
export default async function FacilityListItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.facilityListItem.findUnique({
    where: { id },
    include: {
      gateSignInspections: { orderBy: { inspectionDate: "desc" } },
      bridgeLedgers: { orderBy: { createdAt: "desc" } },
      bridgeInspections: { orderBy: { inspectionDate: "desc" } },
      slopeStructureInspections: { orderBy: { inspectionDate: "desc" } },
    },
  });
  if (!item) notFound();

  const facilityTypeLabel = formatFacilityType(item.facilityType, item.facilitySubType);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <RecordViewHistory
        kind="facility"
        id={item.id}
        title={item.managementNo}
        subtitle={facilityTypeLabel ?? undefined}
        href={`/facility-list/${item.id}`}
      />
      <BackLink fallbackHref="/facility-list">
        ← 施設一覧に戻る
      </BackLink>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{item.managementNo}</h1>

      <section className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-300 px-3 py-2 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">施設諸元（台帳）</h2>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
          <Field label="旧管理番号" value={item.oldManagementNo} />
          <Field label="管轄事務所" value={item.officeName} />
          <Field label="施設分野" value={item.facilityField} />
          <Field label="路線種別" value={item.routeType} />
          <Field
            label="路線名"
            value={item.routeName}
            href={
              item.routeName
                ? buildFacilityRouteSearchHref(item.routeName, item.facilityType, item.facilitySubType)
                : undefined
            }
          />
          <Field label="施設種別" value={facilityTypeLabel} />
          <Field label="施設名称" value={item.facilityName} />
          <Field label="所在地" value={item.location} />
          <Field
            label="緯度経度"
            value={item.latitude != null && item.longitude != null ? `${item.latitude}, ${item.longitude}` : null}
          />
          <Field label="建設年度" value={item.constructionYear} />
          <Field label="法令台帳" value={item.regulationLedgerName} />
          <Field label="法令台帳・作成更新" value={item.regulationLedgerUpdatedAt} />
          <Field label="施設台帳" value={item.facilityLedgerName} />
          <Field label="施設台帳・作成更新" value={item.facilityLedgerUpdatedAt} />
          <div className="sm:col-span-2">
            <Field label="備考" value={item.remarks} />
          </div>
        </dl>
      </section>

      {/* 詳細な点検調書（門型標識・橋梁台帳）への導線（会話ログ「点検調書と
          施設台帳が組み合わさっていない状態です」参照）。管理番号で紐付いて
          いても、これまでこの画面からは一切見えなかった（/inspections/gate-signs
          からはこの施設への逆リンクが出ていたが、こちら側からの順リンクが
          無かった）ため追加した。下の「点検記録」は簡易な点検履歴の一覧、
          こちらは1施設1件ずつの詳細な点検報告書（写真・部材ごとの損傷記録等を
          含む）という違いがある。 */}
      {(item.gateSignInspections.length > 0 ||
        item.bridgeLedgers.length > 0 ||
        item.bridgeInspections.length > 0 ||
        item.slopeStructureInspections.length > 0) && (
        <section className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="border-b border-gray-300 px-3 py-2 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              詳細な点検調書（
              {item.gateSignInspections.length +
                item.bridgeLedgers.length +
                item.bridgeInspections.length +
                item.slopeStructureInspections.length}
              件）
            </h2>
          </div>
          <ul className="divide-y divide-gray-200 p-3 text-sm dark:divide-gray-700">
            {item.gateSignInspections.map((insp) => (
              <li key={insp.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  門型標識
                </span>
                <Link href={`/inspections/gate-signs/${insp.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {insp.managementNo ?? insp.sourceFileName ?? "（管理番号不明）"}
                </Link>
                {insp.overallJudgment && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">判定区分 {insp.overallJudgment}</span>
                )}
                {insp.inspectionDate && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    点検日: {new Date(insp.inspectionDate).toLocaleDateString("ja-JP")}
                  </span>
                )}
              </li>
            ))}
            {item.bridgeInspections.map((insp) => (
              <li key={insp.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  橋梁（点検調書）
                </span>
                <Link href={`/inspections/bridges/${insp.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {insp.bridgeName ?? insp.managementNo ?? "（橋梁名不明）"}
                </Link>
                {insp.overallJudgment && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">判定区分 {insp.overallJudgment}</span>
                )}
                {insp.inspectionDate && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    点検日: {new Date(insp.inspectionDate).toLocaleDateString("ja-JP")}
                  </span>
                )}
              </li>
            ))}
            {item.slopeStructureInspections.map((insp) => (
              <li key={insp.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  法面構造物
                </span>
                <Link href={`/inspections/slopes/${insp.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {insp.managementNo ?? insp.sourceFileName ?? "（箇所番号不明）"}
                </Link>
                {insp.overallJudgment && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">判定区分 {insp.overallJudgment}</span>
                )}
                {insp.inspectionDate && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    点検日: {new Date(insp.inspectionDate).toLocaleDateString("ja-JP")}
                  </span>
                )}
              </li>
            ))}
            {item.bridgeLedgers.map((bridge) => (
              <li key={bridge.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  橋梁台帳
                </span>
                <Link href={`/bridge-ledgers/${bridge.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {bridge.bridgeName ?? bridge.managementNo ?? "（橋梁名不明）"}
                </Link>
                {bridge.managementNo && bridge.bridgeName && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">{bridge.managementNo}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | null;
  // 値をクリック可能にする場合のリンク先（会話ログ「路線名をクリックして、
  // その路線の関連施設を表示」参照。路線名Fieldにのみ渡す）。
  href?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="text-gray-800 dark:text-gray-100">
        {value && href ? (
          <Link href={href} className="text-blue-600 dark:text-blue-400 hover:underline">
            {value}
          </Link>
        ) : (
          (value ?? "—")
        )}
      </dd>
    </div>
  );
}
