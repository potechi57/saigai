import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deleteBridgeLedger } from "@/lib/actions/bridge-ledger-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import RecordViewHistory from "@/components/RecordViewHistory";
import SheetTabs from "@/components/SheetTabs";
import ExcelSheetGrid from "@/components/ExcelSheetGrid";
import type { ExtractedGrid } from "@/lib/excel/excel-grid-extract";

export const dynamic = "force-dynamic";

// 橋梁台帳1件の詳細画面（会話ログ「点検調書やカルテ点検の表示形式のような形」
// 参照）。点検調書（門型標識）詳細画面と同じ、SheetTabsで元Excelのシート構成
// そのままにタブ切替する構成。
//   - 「基本情報（橋梁調書）」タブ: 約50項目を、点検調書の様式１タブと同じ
//     dl（項目名+値）のグリッドで表示する（BridgeLedger本体の列。1項目=1DB列）。
//   - 「橋梁台帳」「画像」「付属図」タブ: BridgeLedgerSheet.gridを
//     ExcelSheetGridでそのままHTML表として再現する（個々の項目は構造化して
//     いないが、見た目は元Excelに忠実。会話ログ「汎用テーブル表示で再現
//     （推奨）」参照）。
export default async function BridgeLedgerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bridge = await prisma.bridgeLedger.findUnique({
    where: { id },
    include: {
      sheets: { orderBy: { sortOrder: "asc" } },
      facilityListItem: { select: { id: true, managementNo: true } },
    },
  });
  if (!bridge) notFound();

  const title = bridge.bridgeName ?? bridge.managementNo ?? bridge.sourceFileName ?? "（橋名不明）";

  const basicInfo = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">基本情報（橋梁調書）</h2>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">基本情報</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field label="管理番号" value={bridge.managementNo} />
            <Field label="管理区分" value={bridge.managementCategory} />
            <Field label="橋名（フリガナ）" value={bridge.bridgeNameKana} />
            <Field label="橋名" value={bridge.bridgeName} />
            <Field label="事務所名" value={bridge.officeName} />
            <Field label="路線名" value={bridge.routeName} />
            <Field label="径間数" value={bridge.spanCount != null ? String(bridge.spanCount) : null} />
            <Field label="架設年月日" value={bridge.constructedAt} />
            <div className="sm:col-span-2">
              <Field label="所在地" value={bridge.location} />
            </div>
            <Field
              label="緯度経度"
              value={bridge.latitude != null && bridge.longitude != null ? `${bridge.latitude}, ${bridge.longitude}` : null}
            />
          </dl>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">構造</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field label="橋種" value={bridge.bridgeType} />
            <Field label="橋長(m)" value={bridge.bridgeLengthM != null ? String(bridge.bridgeLengthM) : null} />
            <Field label="上部工形式" value={bridge.superstructureType} />
            <Field label="床板材料" value={bridge.deckMaterial} />
            <Field label="下部工形式" value={bridge.substructureType} />
            <Field label="適用示方書" value={bridge.appliedSpec} />
            <Field label="主桁本数" value={bridge.mainGirderCount != null ? String(bridge.mainGirderCount) : null} />
            <Field label="橋台高さ(m)" value={bridge.abutmentHeightM != null ? String(bridge.abutmentHeightM) : null} />
            <Field label="橋脚高さ(m)" value={bridge.pierHeightM != null ? String(bridge.pierHeightM) : null} />
          </dl>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">幅員・面積</h3>
          {/* 元Excelの「幅員」「面積」2行×（車道／自・歩道／路肩／地覆／その他／合計）
              6列の表を、そのまま小さな表で再現する。 */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="border border-gray-300 px-2 py-1 text-left text-gray-500 dark:border-gray-600 dark:text-gray-400"> </th>
                  <th className="border border-gray-300 px-2 py-1 text-gray-600 dark:border-gray-600 dark:text-gray-300">車道</th>
                  <th className="border border-gray-300 px-2 py-1 text-gray-600 dark:border-gray-600 dark:text-gray-300">自・歩道</th>
                  <th className="border border-gray-300 px-2 py-1 text-gray-600 dark:border-gray-600 dark:text-gray-300">路肩</th>
                  <th className="border border-gray-300 px-2 py-1 text-gray-600 dark:border-gray-600 dark:text-gray-300">地覆</th>
                  <th className="border border-gray-300 px-2 py-1 text-gray-600 dark:border-gray-600 dark:text-gray-300">その他</th>
                  <th className="border border-gray-300 px-2 py-1 text-gray-600 dark:border-gray-600 dark:text-gray-300">合計</th>
                </tr>
              </thead>
              <tbody className="text-gray-800 dark:text-gray-100">
                <tr>
                  <td className="border border-gray-300 px-2 py-1 font-medium text-gray-500 dark:border-gray-600 dark:text-gray-400">幅員(m)</td>
                  <td className="border border-gray-300 px-2 py-1">{decimalOrDash(bridge.widthRoadwayM)}</td>
                  <td className="border border-gray-300 px-2 py-1">{decimalOrDash(bridge.widthSidewalkM)}</td>
                  <td className="border border-gray-300 px-2 py-1">{decimalOrDash(bridge.widthShoulderM)}</td>
                  <td className="border border-gray-300 px-2 py-1">{decimalOrDash(bridge.widthCurbM)}</td>
                  <td className="border border-gray-300 px-2 py-1">{decimalOrDash(bridge.widthOtherM)}</td>
                  <td className="border border-gray-300 px-2 py-1 font-semibold">{decimalOrDash(bridge.widthTotalM)}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-2 py-1 font-medium text-gray-500 dark:border-gray-600 dark:text-gray-400">面積(㎡)</td>
                  <td className="border border-gray-300 px-2 py-1">{decimalOrDash(bridge.areaRoadwayM2)}</td>
                  <td className="border border-gray-300 px-2 py-1">{decimalOrDash(bridge.areaSidewalkM2)}</td>
                  <td className="border border-gray-300 px-2 py-1">{decimalOrDash(bridge.areaShoulderM2)}</td>
                  <td className="border border-gray-300 px-2 py-1">{decimalOrDash(bridge.areaCurbM2)}</td>
                  <td className="border border-gray-300 px-2 py-1">{decimalOrDash(bridge.areaOtherM2)}</td>
                  <td className="border border-gray-300 px-2 py-1 font-semibold">{decimalOrDash(bridge.areaTotalM2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {bridge.widthRemarks && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">備考: {bridge.widthRemarks}</p>}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">交通・防災</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field label="センサス番号" value={bridge.censusNo} />
            <Field label="耐震補強" value={bridge.seismicReinforcement} />
            <Field label="調査年" value={bridge.surveyYear} />
            <Field label="交通量" value={bridge.trafficVolume} />
            <Field label="大型車交通量" value={bridge.largeVehicleTraffic} />
            <Field label="海岸からの距離" value={bridge.coastDistance} />
            <Field label="緊急輸送道路の指定" value={bridge.emergencyTransportRoad} />
            <Field label="優先確保ルートの指定" value={bridge.priorityRoute} />
            <Field label="人工密集地区" value={bridge.denselyPopulatedArea} />
            <Field label="迂回路" value={bridge.detourRoute} />
            <Field label="バス路線" value={bridge.busRoute} />
            <Field label="橋梁管理区分" value={bridge.bridgeManagementCategory} />
            <Field label="自専道or一般道" value={bridge.roadCategory} />
            <Field label="荷重制限" value={bridge.loadRestriction} />
          </dl>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">特殊区分</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field label="跨線橋" value={bridge.overpassRailway} />
            <Field label="跨道線" value={bridge.overpassRoad} />
            <Field label="渡海橋" value={bridge.overseaBridge} />
            <Field label="長大橋" value={bridge.longBridge} />
            <Field label="塩害地域" value={bridge.saltDamageArea} />
            <Field label="上下線" value={bridge.upDownLine} />
            <Field label="自転車道" value={bridge.bicycleRoad} />
            <Field label="歩道橋" value={bridge.footbridge} />
            <Field label="側道橋" value={bridge.sideRoadBridge} />
            <Field label="耐候性鋼材" value={bridge.weatheringSteel} />
            <Field label="占用物件（名称）" value={bridge.occupyingObjectName} />
            <Field label="路下条件・河川" value={bridge.underRiver} />
            <Field label="路下条件・道路" value={bridge.underRoad} />
            <Field label="路下条件・鉄道" value={bridge.underRailway} />
            <Field label="路下条件・その他" value={bridge.underOther} />
          </dl>
        </div>
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <RecordViewHistory
        kind="bridge_ledger"
        id={bridge.id}
        title={title}
        subtitle={bridge.routeName ?? undefined}
        href={`/inspections/bridges/${bridge.id}`}
      />
      <Link href="/inspections/bridges" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 橋梁台帳一覧に戻る
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{title}</h1>
        {bridge.managementNo && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {bridge.managementNo}
          </span>
        )}
      </div>
      {bridge.facilityListItem ? (
        <Link
          href={`/facility-list/${bridge.facilityListItem.id}`}
          className="block text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          施設台帳（{bridge.facilityListItem.managementNo}）を見る →
        </Link>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          施設台帳と未紐付け（管理番号が施設台帳のいずれの行とも一致しませんでした）
        </p>
      )}

      <SheetTabs
        tabs={[
          { id: "chousho", label: "基本情報（橋梁調書）", content: basicInfo },
          ...bridge.sheets.map((s) => ({
            id: s.id,
            label: s.label,
            content: (
              <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
                <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{s.label}</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    元Excelのシートを見た目そのままに再現した表です（個別の項目は検索・編集できません）。
                  </p>
                </div>
                <div className="p-3">
                  <ExcelSheetGrid grid={s.grid as unknown as ExtractedGrid} />
                </div>
              </section>
            ),
          })),
        ]}
      />

      <form action={deleteBridgeLedger.bind(null, bridge.id)}>
        <ConfirmSubmitButton
          message={`「${title}」を削除しますか？（元に戻せません）`}
          pendingLabel="削除中..."
          className="text-sm text-red-600 hover:underline dark:text-red-400"
        >
          この橋梁台帳を削除
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

// Prisma Decimalは素のまま子要素に渡すとエラーになるため（実データ・precedent通り、
// 常にString()を経由する。app/inspections/gate-signs/[id]/page.tsxのroadWidthM等と同じ方針）、
// 幅員・面積表用の小さな変換ヘルパーを用意する。
function decimalOrDash(value: { toString(): string } | null): string {
  return value == null ? "—" : String(value);
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">{value ?? "—"}</dd>
    </div>
  );
}
