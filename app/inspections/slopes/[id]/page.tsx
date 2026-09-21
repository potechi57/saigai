import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deleteSlopeStructureInspection } from "@/lib/actions/slope-structure-inspection-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import RecordViewHistory from "@/components/RecordViewHistory";
import { PhotoLightboxGroup, PhotoLightboxThumbnail } from "@/components/PhotoLightbox";
import SheetTabs from "@/components/SheetTabs";
import ExcelSheetGrid from "@/components/ExcelSheetGrid";
import type { ExtractedGrid } from "@/lib/excel/excel-grid-extract";
import { buildFacilityRouteSearchHref } from "@/lib/facility-taxonomy";
import { formatLatLngDms } from "@/lib/geo";
import BackLink from "@/components/BackLink";
import FavoriteToggleButton from "@/components/FavoriteToggleButton";
import JudgmentEditForm from "@/components/JudgmentEditForm";
import { Th, Td as BaseTd } from "@/components/ExcelTable";
import { JUDGMENT_BADGE, JUDGMENT_OPTIONS_1_TO_3 } from "@/lib/labels";

export const dynamic = "force-dynamic";

// app/inspections/gate-signs/[id]/page.tsxと同じ理由（components/ExcelTable.tsxのコメント参照）。
function Td(props: Omit<Parameters<typeof BaseTd>[0], "wrap">) {
  return <BaseTd wrap {...props} />;
}

// 点検調書（道路＞法面構造物）1件の詳細画面（app/inspections/bridges/[id]/page.tsxと
// 同じ構成。元Excelのシート構成のまま「点検表」「点検チェックシート」の2タブに
// 切り替える。チェックシートは構造物種類ごとに項目が全く異なるため、個別項目を
// DB列化せず元の見た目のままExcelSheetGridで再現する
// （prisma/schema.prismaのSlopeStructureInspectionコメント参照）。
export default async function SlopeStructureInspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const insp = await prisma.slopeStructureInspection.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      sheets: { orderBy: { sortOrder: "asc" } },
      facilityListItem: { select: { id: true, managementNo: true } },
      favorite: { select: { id: true } },
      supersededByInspection: { select: { id: true } },
    },
  });
  if (!insp) notFound();

  const title = insp.managementNo ?? insp.sourceFileName ?? "（箇所番号不明）";

  // 写真は由来（category）ごとに分ける（BridgeInspectionPhotoと同じ考え方。
  // lib/excel/slope-structure-inspection-import.ts参照）。
  const sitePlanPhotos = insp.photos.filter((p) => p.category === "sitePlan");
  const overviewPhotos = insp.photos.filter((p) => p.category === "overview");
  const damagePhotos = insp.photos.filter((p) => p.category === "damage");
  const checklistPhotos = insp.photos.filter((p) => p.category === "checklist");

  const tenkenHyoSheet = insp.sheets.find((s) => s.sheetName.startsWith("点検表"));
  const checklistSheet = insp.sheets.find((s) => s.sheetName.startsWith("様式"));

  // 年度別履歴（GateSignInspection/BridgeInspectionと同じ方式）。
  const pastYears: { id: string; inspectionDate: Date | null; sourceFileName: string | null }[] = [];
  {
    let cursor = insp.previousInspectionId;
    while (cursor) {
      const past: { id: string; inspectionDate: Date | null; sourceFileName: string | null; previousInspectionId: string | null } | null =
        await prisma.slopeStructureInspection.findUnique({
          where: { id: cursor },
          select: { id: true, inspectionDate: true, sourceFileName: true, previousInspectionId: true },
        });
      if (!past) break;
      pastYears.push(past);
      cursor = past.previousInspectionId;
    }
  }

  const tenkenHyoTab = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">基本情報（点検表）</h2>
      </div>

      <table className="w-full border-collapse text-xs">
        <tbody>
          <tr>
            <Th>箇所番号</Th>
            <Th>点検対象項目</Th>
            <Th>路線名</Th>
            <Th colSpan={2}>所在地</Th>
            <Th>距離標（自〜至）</Th>
          </tr>
          <tr>
            <Td>{insp.managementNo || "—"}</Td>
            <Td>{insp.structureType || "—"}</Td>
            <Td>
              {insp.routeName ? (
                <Link
                  href={buildFacilityRouteSearchHref(insp.routeName, "法面構造物")}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {insp.routeName}
                </Link>
              ) : (
                "—"
              )}
            </Td>
            <Td colSpan={2}>{insp.location || "—"}</Td>
            <Td>
              {insp.distanceMarkFrom || insp.distanceMarkTo
                ? `${insp.distanceMarkFrom ?? "—"} 〜 ${insp.distanceMarkTo ?? "—"}`
                : "—"}
            </Td>
          </tr>

          <tr>
            <Th>管理機関名</Th>
            <Th>点検日</Th>
            <Th>撮影日</Th>
            <Th>天候</Th>
            <Th colSpan={2}>緯度経度</Th>
          </tr>
          <tr>
            <Td>{insp.managerOrgName || "—"}</Td>
            <Td>{insp.inspectionDate ? new Date(insp.inspectionDate).toLocaleDateString("ja-JP") : "—"}</Td>
            <Td>{insp.photoDate ? new Date(insp.photoDate).toLocaleDateString("ja-JP") : "—"}</Td>
            <Td>{insp.weather || "—"}</Td>
            <Td colSpan={2}>
              {insp.latitude != null && insp.longitude != null
                ? formatLatLngDms(Number(insp.latitude), Number(insp.longitude))
                : "—"}
            </Td>
          </tr>

          <tr>
            <Th colSpan={6}>評点による評価・点検者の評価</Th>
          </tr>
          <tr>
            <td colSpan={6} className="border border-gray-400 bg-white p-2 align-top dark:border-gray-600 dark:bg-gray-900">
              <div className="flex flex-wrap items-baseline gap-3">
                {insp.overallJudgment && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 ${JUDGMENT_BADGE[insp.overallJudgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
                  >
                    点検者の評価 {insp.overallJudgment}
                  </span>
                )}
                <span>構造物評点計: {insp.structureScore != null ? String(insp.structureScore) : "—"}</span>
                <span>地山評点計: {insp.groundScore != null ? String(insp.groundScore) : "—"}</span>
              </div>
            </td>
          </tr>

          {insp.geologyDescription && (
            <tr>
              <Th colSpan={6}>背後地山の地形・地質</Th>
            </tr>
          )}
          {insp.geologyDescription && (
            <tr>
              <Td colSpan={6}>{insp.geologyDescription}</Td>
            </tr>
          )}

          {insp.summaryComment && (
            <tr>
              <Th colSpan={6}>総括コメント</Th>
            </tr>
          )}
          {insp.summaryComment && (
            <tr>
              <Td colSpan={6}>{insp.summaryComment}</Td>
            </tr>
          )}

          {insp.inspectionFindings && (
            <tr>
              <Th colSpan={6}>点検状況（注意箇所等）</Th>
            </tr>
          )}
          {insp.inspectionFindings && (
            <tr>
              <Td colSpan={6}>{insp.inspectionFindings}</Td>
            </tr>
          )}

          {insp.dailyInspectionPoints && (
            <tr>
              <Th colSpan={6}>日常点検の着眼点</Th>
            </tr>
          )}
          {insp.dailyInspectionPoints && (
            <tr>
              <Td colSpan={6}>{insp.dailyInspectionPoints}</Td>
            </tr>
          )}

          {(sitePlanPhotos.length > 0 || overviewPhotos.length > 0) && (
            <tr>
              <Th colSpan={6}>平面図・概略断面図／現況写真</Th>
            </tr>
          )}
          {(sitePlanPhotos.length > 0 || overviewPhotos.length > 0) && (
            <tr>
              <td colSpan={6} className="border border-gray-400 bg-white p-2 align-top dark:border-gray-600 dark:bg-gray-900">
                <PhotoLightboxGroup
                  photos={[...sitePlanPhotos, ...overviewPhotos].map((p) => ({ id: p.id, url: p.url, caption: p.caption }))}
                >
                  <div className="grid grid-cols-2 gap-3">
                    {[...sitePlanPhotos, ...overviewPhotos].map((p, i) => (
                      <div key={p.id}>
                        <PhotoLightboxThumbnail index={i}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.url}
                            alt={p.caption ?? "写真"}
                            className="aspect-video w-full cursor-zoom-in rounded border border-gray-300 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-800"
                          />
                        </PhotoLightboxThumbnail>
                        {p.caption && (
                          <p className="mt-1 whitespace-pre-wrap text-center text-xs font-medium text-gray-600 dark:text-gray-300">
                            {p.caption}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </PhotoLightboxGroup>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="border-t border-gray-400 dark:border-gray-600">
        <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">損傷写真</h2>
        </div>
        {damagePhotos.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 dark:text-gray-500">損傷写真はありません。</p>
        ) : (
          <PhotoLightboxGroup photos={damagePhotos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }))}>
            <div className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-2">
              {damagePhotos.map((p, i) => (
                <div key={p.id} className="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
                  <PhotoLightboxThumbnail index={i} className="block w-full text-left">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption ?? "損傷写真"}
                      className="aspect-video w-full cursor-zoom-in bg-gray-50 object-contain dark:bg-gray-800"
                    />
                  </PhotoLightboxThumbnail>
                  {p.caption && (
                    <p className="whitespace-pre-wrap border-t border-gray-200 p-2 text-sm text-gray-800 dark:border-gray-700 dark:text-gray-100">
                      {p.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </PhotoLightboxGroup>
        )}
      </div>

      {tenkenHyoSheet && (
        <details className="border-t border-gray-400 dark:border-gray-600">
          <summary className="cursor-pointer select-none bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            元Excel（点検表）をそのまま確認する
          </summary>
          <div className="p-3">
            <ExcelSheetGrid grid={tenkenHyoSheet.grid as unknown as ExtractedGrid} />
          </div>
        </details>
      )}
    </section>
  );

  const checklistTab = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          点検チェックシート{insp.structureType ? `（${insp.structureType}）` : ""}
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          元Excelのシートを見た目そのままに再現した表です（個別の項目は検索・編集できません）。
        </p>
      </div>
      {checklistSheet ? (
        <div className="p-3">
          <ExcelSheetGrid grid={checklistSheet.grid as unknown as ExtractedGrid} />
        </div>
      ) : (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">点検チェックシートが見つかりませんでした。</p>
      )}
      {checklistPhotos.length > 0 && (
        <div className="border-t border-gray-400 p-3 dark:border-gray-600">
          <PhotoLightboxGroup photos={checklistPhotos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }))}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {checklistPhotos.map((p, i) => (
                <div key={p.id}>
                  <PhotoLightboxThumbnail index={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption ?? "写真"}
                      className="aspect-video w-full cursor-zoom-in rounded border border-gray-300 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-800"
                    />
                  </PhotoLightboxThumbnail>
                  {p.caption && (
                    <p className="mt-1 whitespace-pre-wrap text-center text-xs font-medium text-gray-600 dark:text-gray-300">
                      {p.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </PhotoLightboxGroup>
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <RecordViewHistory
        kind="slope_structure_inspection"
        id={insp.id}
        title={title}
        subtitle={insp.routeName ?? undefined}
        href={`/inspections/slopes/${insp.id}`}
      />
      <BackLink fallbackHref="/inspections/slopes">
        ← 点検調書（法面構造物）一覧に戻る
      </BackLink>

      {insp.supersededByInspection && (
        <p className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
          これは過去年度の記録です。
          <Link href={`/inspections/slopes/${insp.supersededByInspection.id}`} className="ml-1 underline">
            最新の記録を見る →
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{title}</h1>
        {insp.supersededByInspection ? (
          insp.overallJudgment && (
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${JUDGMENT_BADGE[insp.overallJudgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
            >
              {insp.overallJudgment}
            </span>
          )
        ) : (
          <JudgmentEditForm
            target={{ type: "slopeStructureInspection", id: insp.id, title }}
            initialValue={insp.overallJudgment}
            options={JUDGMENT_OPTIONS_1_TO_3}
          />
        )}
        <FavoriteToggleButton
          target={{ type: "slopeStructureInspection", id: insp.id }}
          initialIsFavorite={insp.favorite != null}
        />
      </div>
      {insp.facilityListItem ? (
        <Link
          href={`/facility-list/${insp.facilityListItem.id}`}
          className="block text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          施設台帳（{insp.facilityListItem.managementNo}）を見る →
        </Link>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          施設台帳と未紐付け（Excel内の箇所番号が施設台帳のいずれの行とも一致しませんでした）
        </p>
      )}

      {pastYears.length > 0 && (
        <div className="rounded border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">過去の点検履歴</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {pastYears.map((p) => (
              <li key={p.id}>
                <Link href={`/inspections/slopes/${p.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {p.inspectionDate ? new Date(p.inspectionDate).toLocaleDateString("ja-JP") : p.sourceFileName ?? p.id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SheetTabs
        tabs={[
          { id: "tenkenhyo", label: "点検表", content: tenkenHyoTab },
          { id: "checklist", label: "点検チェックシート", content: checklistTab },
        ]}
      />

      {!insp.supersededByInspection && (
        <form action={deleteSlopeStructureInspection.bind(null, insp.id)}>
          <ConfirmSubmitButton
            message={
              pastYears.length > 0
                ? `「${title}」を削除しますか？過去の年度分を含め、全ての記録（${pastYears.length + 1}件）が削除されます。（元に戻せません）`
                : `「${title}」を削除しますか？（元に戻せません）`
            }
            pendingLabel="削除中..."
            className="text-sm text-red-600 hover:underline dark:text-red-400"
          >
            この点検調書を削除
          </ConfirmSubmitButton>
        </form>
      )}
    </div>
  );
}
