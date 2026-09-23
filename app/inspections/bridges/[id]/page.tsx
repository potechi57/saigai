import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { BridgeInspectionMember } from "@prisma/client";
import { deleteBridgeInspection } from "@/lib/actions/bridge-inspection-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import RecordViewHistory from "@/components/RecordViewHistory";
import { PhotoLightboxGroup, PhotoLightboxThumbnail } from "@/components/PhotoLightbox";
import SheetTabs from "@/components/SheetTabs";
import { buildFacilityRouteSearchHref } from "@/lib/facility-taxonomy";
import { formatLatLngDms } from "@/lib/geo";
import BackLink from "@/components/BackLink";
import FavoriteToggleButton from "@/components/FavoriteToggleButton";
import JudgmentEditForm from "@/components/JudgmentEditForm";
import type {
  BridgeInspectionMemberOverviewRow,
  BridgeInspectionSpanDiagnosis,
} from "@/lib/excel/bridge-inspection-import";
import { Th, Td as BaseTd } from "@/components/ExcelTable";
import { JUDGMENT_BADGE, JUDGMENT_OPTIONS_1_TO_4 } from "@/lib/labels";

export const dynamic = "force-dynamic";

// gate-signs/[id]/page.tsxと同じ理由（components/ExcelTable.tsxのコメント参照）。
function Td(props: Omit<Parameters<typeof BaseTd>[0], "wrap">) {
  return <BaseTd wrap {...props} />;
}

// 点検調書（道路＞橋梁）1件の詳細画面（app/inspections/gate-signs/[id]/page.tsxと
// 同じ構成。元Excelのシート構成のまま「様式１」「径間１」「径間２」…と横並びに
// 切り替えるタブ表示にする。橋梁は径間（スパン）ごとに損傷記録が分かれるため
// （lib/excel/bridge-inspection-import.ts参照）、門型標識のpageNoではなく
// spanNoでタブを分ける）。
export default async function BridgeInspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const insp = await prisma.bridgeInspection.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      members: { orderBy: { sortOrder: "asc" } },
      facilityListItem: { select: { id: true, managementNo: true } },
      favorite: { select: { id: true } },
      supersededByInspection: { select: { id: true } },
    },
  });
  if (!insp) notFound();

  const title = insp.bridgeName ?? insp.managementNo ?? insp.sourceFileName ?? "（橋梁名不明）";

  // 写真は由来シート（category）ごとにタブを分ける（会話ログ「これ以降は、
  // エクセルに合わせて次のタブに移ります」参照。lib/excel/
  // bridge-inspection-import.tsのBridgeInspectionPhotoCategory参照）。
  const overviewPhotos = insp.photos.filter((p) => p.category === "overview").map((p) => ({ id: p.id, url: p.url, caption: p.caption }));
  const damagePhotos = insp.photos.filter((p) => p.category === "damageHighlight");
  const drawingPhotos = insp.photos.filter((p) => p.category === "drawing").map((p) => ({ id: p.id, url: p.url, caption: p.caption }));
  const sitePhotos = insp.photos.filter((p) => p.category === "site").map((p) => ({ id: p.id, url: p.url, caption: p.caption }));

  // その１（橋梁諸元）タブ用に、管理番号が一致する橋梁台帳（BridgeLedger）を
  // 参照する。台帳側に既にある詳細諸元（橋長・橋種・上部工形式等）は点検調書
  // 側に重複して取り込まず、あれば台帳のデータを表示する（会話ログ「重複する
  // ならばデータを取り込む必要はありません。本当に橋梁台帳に記載があるならば、
  // そのデータは橋梁台帳側のデータを参考に表示するようにしてください。つまり、
  // 橋梁台帳のデータベースから引っ張ってきてください」参照）。
  const ledger = insp.managementNo
    ? await prisma.bridgeLedger.findFirst({ where: { managementNo: insp.managementNo } })
    : null;

  // 年度別履歴（GateSignInspectionと同じ方式。schema.prismaの
  // BridgeInspection.previousInspectionIdコメント参照）。
  const pastYears: { id: string; inspectionDate: Date | null; sourceFileName: string | null }[] = [];
  {
    let cursor = insp.previousInspectionId;
    while (cursor) {
      const past: { id: string; inspectionDate: Date | null; sourceFileName: string | null; previousInspectionId: string | null } | null =
        await prisma.bridgeInspection.findUnique({
          where: { id: cursor },
          select: { id: true, inspectionDate: true, sourceFileName: true, previousInspectionId: true },
        });
      if (!past) break;
      pastYears.push(past);
      cursor = past.previousInspectionId;
    }
  }

  // 径間（スパン）ごとにタブを分ける（会話ログ「過去の門型標識点検のエクセル
  // ファイルを参考に...」参照。門型標識のpageNoグループ化と同じ考え方）。
  const spanGroups: { spanNo: number; members: BridgeInspectionMember[] }[] = [];
  for (const m of insp.members) {
    let group = spanGroups.find((g) => g.spanNo === m.spanNo);
    if (!group) {
      group = { spanNo: m.spanNo, members: [] };
      spanGroups.push(group);
    }
    group.members.push(m);
  }
  spanGroups.sort((a, b) => a.spanNo - b.spanNo);

  // 径間番号の集合は、その５（損傷カード。members）とその４（径間ごとの
  // 損傷評価。spanDiagnoses）の両方を合わせた和集合にする（損傷カードが1件も
  // 無い径間でも、その４の評価だけは表示したいため）。
  const memberOverview = (insp.memberOverview as unknown as BridgeInspectionMemberOverviewRow[] | null) ?? [];
  const spanDiagnoses = (insp.spanDiagnoses as unknown as BridgeInspectionSpanDiagnosis[] | null) ?? [];
  const spanNos = Array.from(new Set([...spanGroups.map((g) => g.spanNo), ...spanDiagnoses.map((d) => d.spanNo)])).sort(
    (a, b) => a - b
  );

  // 「道路橋様式１」1シート分の内容のみを表示するタブ（会話ログ「エクセルの
  // 最初のタブには、径間数についての表記はありませんよね。したがって、その
  // 項目は消してください。代わりに、管理者名、定期点検実施年月日、路下条件、
  // 代替路の有無、自専道or一般道、緊急避難道路、占有物件(名称)、などエクセルに
  // 書いてある通りに実装してほしいです」参照）。以前はここに「定期点検調書
  // （その１）」＝橋梁諸元シートの項目（径間数・事務所名・点検者・責任者）を
  // 誤って混ぜていたため、それらは別タブ（その１）に移した。
  const form1 = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">基本情報（様式１）</h2>
      </div>

      <table className="w-full border-collapse text-xs">
        <tbody>
          <tr>
            <Th>橋梁名</Th>
            <Th>（フリガナ）</Th>
            <Th>路線名</Th>
            <Th>所在地</Th>
            <Th colSpan={2}>緯度経度</Th>
          </tr>
          <tr>
            <Td>{insp.bridgeName || "—"}</Td>
            <Td>{insp.bridgeNameKana || "—"}</Td>
            <Td>
              {insp.routeName ? (
                // 橋梁は施設台帳タブ上「橋梁」に分類される
                // （lib/facility-taxonomy.tsのFACILITY_LEDGER_ITEM_TYPES.road参照）。
                <Link
                  href={buildFacilityRouteSearchHref(insp.routeName, "橋梁")}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {insp.routeName}
                </Link>
              ) : (
                "—"
              )}
            </Td>
            <Td>{insp.location || "—"}</Td>
            <Td colSpan={2}>
              {insp.latitude != null && insp.longitude != null
                ? formatLatLngDms(Number(insp.latitude), Number(insp.longitude))
                : "—"}
            </Td>
          </tr>

          <tr>
            <Th>管理者名</Th>
            <Th>定期点検実施年月日</Th>
            <Th>路下条件</Th>
            <Th>代替路の有無</Th>
            <Th>自専道or一般道</Th>
            <Th>緊急輸送道路</Th>
          </tr>
          <tr>
            <Td>{insp.managerOrgName || "—"}</Td>
            <Td>{insp.inspectionDate ? new Date(insp.inspectionDate).toLocaleDateString("ja-JP") : "—"}</Td>
            <Td>{insp.underRoadCondition || "—"}</Td>
            <Td>{insp.hasAlternateRoute || "—"}</Td>
            <Td>{insp.roadCategory || "—"}</Td>
            <Td>{insp.emergencyTransportRoad || "—"}</Td>
          </tr>

          <tr>
            <Th colSpan={6}>占用物件（名称）</Th>
          </tr>
          <tr>
            <Td colSpan={6}>{insp.occupyingObjects || "—"}</Td>
          </tr>

          {memberOverview.length > 0 && (
            <tr>
              <Th colSpan={6}>部材単位の診断（各部材毎に最悪値を記入）</Th>
            </tr>
          )}
          {memberOverview.length > 0 && (
            <tr>
              <td colSpan={6} className="border border-gray-400 p-0 dark:border-gray-600">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <Th className="whitespace-nowrap">部材名</Th>
                      <Th className="whitespace-nowrap">判定区分</Th>
                      <Th className="whitespace-nowrap">変状の種類</Th>
                      <Th>備考</Th>
                      <Th className="whitespace-nowrap">応急措置後の判定区分</Th>
                      <Th>応急措置内容</Th>
                      <Th className="whitespace-nowrap">応急措置及び判定実施年月日</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberOverview.map((m, i) => (
                      <tr key={`${m.memberName}-${i}`}>
                        <Th className="whitespace-nowrap">{m.memberName}</Th>
                        <Td className="whitespace-nowrap">
                          {m.judgment ? (
                            <span
                              className={`rounded px-1.5 py-0.5 ${JUDGMENT_BADGE[m.judgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
                            >
                              {m.judgment}
                            </span>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td>{m.damageType || "—"}</Td>
                        <Td>{m.remarks || "—"}</Td>
                        <Td className="whitespace-nowrap">{m.postActionJudgment || "—"}</Td>
                        <Td>{m.postActionContent || "—"}</Td>
                        <Td className="whitespace-nowrap">{m.postActionDate || "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>
          )}

          <tr>
            <Th colSpan={6}>道路橋毎の健全性の診断</Th>
          </tr>
          <tr>
            <td colSpan={6} className="border border-gray-400 bg-white p-2 align-top dark:border-gray-600 dark:bg-gray-900">
              <div className="flex flex-wrap items-baseline gap-2">
                {insp.overallJudgment && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${JUDGMENT_BADGE[insp.overallJudgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
                  >
                    判定区分 {insp.overallJudgment}
                  </span>
                )}
                <span>{insp.overallFindings || "—"}</span>
              </div>
            </td>
          </tr>

          <tr>
            <Th>架設年次</Th>
            <Th>橋長</Th>
            <Th>幅員</Th>
            <Th colSpan={3}>橋梁形式</Th>
          </tr>
          <tr>
            <Td>{insp.installedYear != null ? `${insp.installedYear}年` : "—"}</Td>
            <Td>{insp.bridgeLengthM != null ? String(insp.bridgeLengthM) : "—"}</Td>
            <Td>{insp.roadWidthM != null ? String(insp.roadWidthM) : "—"}</Td>
            <Td colSpan={3}>{insp.structureType || "—"}</Td>
          </tr>

          {overviewPhotos.length > 0 && (
            <tr>
              <Th colSpan={6}>全景写真</Th>
            </tr>
          )}
          {overviewPhotos.length > 0 && (
            <tr>
              <td colSpan={6} className="border border-gray-400 bg-white p-2 align-top dark:border-gray-600 dark:bg-gray-900">
                <PhotoLightboxGroup photos={overviewPhotos}>
                  <div className="grid grid-cols-2 gap-3">
                    {overviewPhotos.map((p, i) => (
                      <div key={p.id}>
                        <PhotoLightboxThumbnail index={i} className="relative block w-full text-left">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.url}
                            alt={p.caption ?? "写真"}
                            className="aspect-video w-full cursor-zoom-in rounded border border-gray-300 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-800"
                          />
                          {/* 全景写真は橋を川上から川下に向けて撮影したもので、
                              写真の左側が起点側・右側が終点側になる（会話ログ
                              「写真は、橋を川上から川下に向けてみたものになります。
                              このとき、写真の左側が起点側であり、右側が終点側になる
                              ようにとられています」参照）。この向きが一目で分かる
                              よう、写真上の左端・右端に固定ラベルを重ねて表示する
                              （p.captionは「どちら側から撮った写真か」を示す別の
                              情報のため、そちらは従来どおり写真の下に残す）。 */}
                          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            起点側
                          </span>
                          <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            終点側
                          </span>
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
    </section>
  );

  // 「道路橋様式２」（状況写真（損傷状況））タブ。部材単位の判定区分がⅡ以上の
  // 代表的な損傷を、門型標識の状況写真ページと同じカード形式（写真＋部材名＋
  // 損傷種類＋判定区分バッジ）で表示する（会話ログ「次のタブ以降のチェック
  // シートでは...これは門型標識の状況写真のページを参考にしてください」参照。
  // キャプション文字列のパース結果はlib/excel/bridge-inspection-import.tsの
  // extractDamageHighlightPhotos参照）。
  const form2 = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">状況写真（損傷状況）（様式２）</h2>
      </div>
      {damagePhotos.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">状況写真（損傷状況）はありません。</p>
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
                <div className="space-y-1 border-t border-gray-200 p-2 text-sm dark:border-gray-700">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.judgment && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${JUDGMENT_BADGE[p.judgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
                      >
                        判定区分 {p.judgment}
                      </span>
                    )}
                    {p.spanRef && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {p.spanRef}
                      </span>
                    )}
                  </div>
                  <Field label="部材名" value={p.memberName} />
                  <Field label="損傷種類" value={p.damageType} />
                  {!p.memberName && !p.damageType && p.caption && (
                    <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">{p.caption}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PhotoLightboxGroup>
      )}
    </section>
  );

  // 「定期点検調書（その１）」橋梁諸元タブ。点検調書側で取り込んでいるのは
  // 識別・検索に要る範囲＋点検固有の情報のみで、詳細諸元（橋長・橋種等）は
  // 重複させず橋梁台帳（BridgeLedger）を参照する（上記ledger取得部分参照）。
  const spec1 = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">橋梁諸元（その１）</h2>
      </div>
      <table className="w-full border-collapse text-xs">
        <tbody>
          <tr>
            <Th>橋梁番号</Th>
            <Th>径間数</Th>
            <Th>事務所名</Th>
            <Th>点検者</Th>
            <Th colSpan={2}>責任者</Th>
          </tr>
          <tr>
            <Td>{insp.managementNo || "—"}</Td>
            <Td>{insp.spanCount != null ? String(insp.spanCount) : "—"}</Td>
            <Td>{insp.officeName || "—"}</Td>
            <Td>{insp.inspectorCompany || "—"}</Td>
            <Td colSpan={2}>{insp.responsiblePerson || "—"}</Td>
          </tr>

          {ledger ? (
            <>
              <tr>
                <Th colSpan={6}>橋梁台帳の詳細諸元</Th>
              </tr>
              <tr>
                <Th>橋種</Th>
                <Th>上部工形式</Th>
                <Th>下部工形式</Th>
                <Th>床版材料</Th>
                <Th>架設年月日</Th>
                <Th>橋長(m)</Th>
              </tr>
              <tr>
                <Td>{ledger.bridgeType || "—"}</Td>
                <Td>{ledger.superstructureType || "—"}</Td>
                <Td>{ledger.substructureType || "—"}</Td>
                <Td>{ledger.deckMaterial || "—"}</Td>
                <Td>{ledger.constructedAt || "—"}</Td>
                <Td>{ledger.bridgeLengthM != null ? String(ledger.bridgeLengthM) : "—"}</Td>
              </tr>
              <tr>
                <Th>適用示方書</Th>
                <Th>緊急輸送道路の指定</Th>
                <Th>優先確保ルートの指定</Th>
                <Th colSpan={3}>幅員合計(m)</Th>
              </tr>
              <tr>
                <Td>{ledger.appliedSpec || "—"}</Td>
                <Td>{ledger.emergencyTransportRoad || "—"}</Td>
                <Td>{ledger.priorityRoute || "—"}</Td>
                <Td colSpan={3}>{ledger.widthTotalM != null ? String(ledger.widthTotalM) : "—"}</Td>
              </tr>
              <tr>
                <td colSpan={6} className="border border-gray-400 bg-white p-2 dark:border-gray-600 dark:bg-gray-900">
                  <Link href={`/bridge-ledgers/${ledger.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                    橋梁台帳（全項目）を見る →
                  </Link>
                </td>
              </tr>
            </>
          ) : (
            <tr>
              <td colSpan={6} className="border border-gray-400 bg-white p-2 text-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-500">
                橋梁台帳と未紐付け（管理番号が一致する橋梁台帳データが見つかりませんでした）
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );

  // 「定期点検調書（その２）」橋梁一般図タブ（位置図・平面図・側面図・断面図）。
  const drawing2 = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">橋梁一般図（その２）</h2>
      </div>
      {drawingPhotos.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">橋梁一般図はありません。</p>
      ) : (
        <PhotoLightboxGroup photos={drawingPhotos}>
          <div className="grid grid-cols-2 gap-3 p-3">
            {drawingPhotos.map((p, i) => (
              <div key={p.id}>
                <PhotoLightboxThumbnail index={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.caption ?? "図面"}
                    className="aspect-video w-full cursor-zoom-in rounded border border-gray-300 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-800"
                  />
                </PhotoLightboxThumbnail>
                {p.caption && (
                  <p className="mt-1 text-center text-xs font-medium text-gray-600 dark:text-gray-300">{p.caption}</p>
                )}
              </div>
            ))}
          </div>
        </PhotoLightboxGroup>
      )}
    </section>
  );

  // 「定期点検調書（その３）」橋梁状況写真タブ（起点→終点／終点→起点／
  // 上流→下流／下流→上流）。
  const sitePhoto3 = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">橋梁状況写真（その３）</h2>
      </div>
      {sitePhotos.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">状況写真はありません。</p>
      ) : (
        <PhotoLightboxGroup photos={sitePhotos}>
          <div className="grid grid-cols-2 gap-3 p-3">
            {sitePhotos.map((p, i) => (
              <div key={p.id}>
                <PhotoLightboxThumbnail index={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.caption ?? "状況写真"}
                    className="aspect-video w-full cursor-zoom-in rounded border border-gray-300 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-800"
                  />
                </PhotoLightboxThumbnail>
                {p.caption && (
                  <p className="mt-1 text-center text-xs font-medium text-gray-600 dark:text-gray-300">{p.caption}</p>
                )}
              </div>
            ))}
          </div>
        </PhotoLightboxGroup>
      )}
    </section>
  );

  // 「定期点検調書（その４）」径間別の損傷評価タブ。以前は「径間N」タブの
  // 中にその５（損傷箇所カード）と地続きに表示していたが、様式１〜その３と
  // 同じ「独立したタブ」の並びに無いため見落とされ、「その4が実装されて
  // いない／読み込まれていない」と誤解される事例があった（会話ログ「タブは
  // 様式１、２とその1、２、３と径間1のタブしかありません。その4タブを用意
  // してください」参照）。その１〜その３と同じ、様式Excelの並び順どおりの
  // 独立タブとして追加する（径間が複数ある場合は、径間Nごとにサブタブで
  // 分ける。その５（損傷箇所カード）は写真点数が多く「径間N」タブ配下に
  // 残したほうが自然なため、そちらは従来どおり「径間N」タブ側に残す）。
  const form4 = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">径間別の損傷評価（その４）</h2>
      </div>
      {spanDiagnoses.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">その４（径間別の損傷評価）はありません。</p>
      ) : spanDiagnoses.length === 1 ? (
        <>
          <BridgeSpanHeaderInfo
            spanNo={spanDiagnoses[0].spanNo}
            managementNo={insp.managementNo}
            bridgeName={insp.bridgeName}
            location={insp.location}
            routeName={insp.routeName}
            officeName={insp.officeName}
          />
          <BridgeSpanDiagnosisTable diagnosis={spanDiagnoses[0]} />
        </>
      ) : (
        <SheetTabs
          tabs={spanDiagnoses.map((d) => ({
            id: `form4-span-${d.spanNo}`,
            label: `径間${d.spanNo}`,
            content: (
              <div key={d.spanNo}>
                <BridgeSpanHeaderInfo
                  spanNo={d.spanNo}
                  managementNo={insp.managementNo}
                  bridgeName={insp.bridgeName}
                  location={insp.location}
                  routeName={insp.routeName}
                  officeName={insp.officeName}
                />
                <BridgeSpanDiagnosisTable diagnosis={d} />
              </div>
            ),
          }))}
        />
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <RecordViewHistory
        kind="bridge_inspection"
        id={insp.id}
        title={title}
        subtitle={insp.routeName ?? undefined}
        href={`/inspections/bridges/${insp.id}`}
      />
      <BackLink fallbackHref="/inspections/bridges">
        ← 点検調書（橋梁）一覧に戻る
      </BackLink>

      {insp.supersededByInspection && (
        // GateSignInspectionと同じ方式（app/inspections/gate-signs/[id]/page.tsx参照）。
        <p className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
          これは過去年度の記録です。
          <Link href={`/inspections/bridges/${insp.supersededByInspection.id}`} className="ml-1 underline">
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
              判定区分 {insp.overallJudgment}
            </span>
          )
        ) : (
          <JudgmentEditForm
            target={{ type: "bridgeInspection", id: insp.id, title }}
            initialValue={insp.overallJudgment}
            options={JUDGMENT_OPTIONS_1_TO_4}
          />
        )}
        <FavoriteToggleButton
          target={{ type: "bridgeInspection", id: insp.id }}
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
          施設台帳と未紐付け（Excel内の橋梁番号が施設台帳のいずれの行とも一致しませんでした）
        </p>
      )}

      {pastYears.length > 0 && (
        <div className="rounded border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">過去の点検履歴</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {pastYears.map((p) => (
              <li key={p.id}>
                <Link href={`/inspections/bridges/${p.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {p.inspectionDate ? new Date(p.inspectionDate).toLocaleDateString("ja-JP") : p.sourceFileName ?? p.id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SheetTabs
        tabs={[
          { id: "form1", label: "様式１", content: form1 },
          { id: "form2", label: "様式２", content: form2 },
          { id: "spec1", label: "その１", content: spec1 },
          { id: "drawing2", label: "その２", content: drawing2 },
          { id: "sitePhoto3", label: "その３", content: sitePhoto3 },
          { id: "spanDiagnosis4", label: "その４", content: form4 },
          ...spanNos.map((spanNo) => ({
            id: `span-${spanNo}`,
            label: `径間${spanNo}`,
            content: (
              <BridgeSpanPage
                key={spanNo}
                spanNo={spanNo}
                managementNo={insp.managementNo}
                bridgeName={insp.bridgeName}
                location={insp.location}
                routeName={insp.routeName}
                officeName={insp.officeName}
                members={spanGroups.find((g) => g.spanNo === spanNo)?.members ?? []}
              />
            ),
          })),
        ]}
      />

      {!insp.supersededByInspection && (
        <form action={deleteBridgeInspection.bind(null, insp.id)}>
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

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | null;
  href?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">
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

// その４・その５（径間タブ）共通のヘッダー情報（橋梁番号・橋梁名・径間番号・
// 所在地・路線名・事務所名）。元Excelでは両シートの上部に同じ項目が繰り返し
// 載っている（BridgeSpanPageのコメント参照）。
function BridgeSpanHeaderInfo({
  spanNo,
  managementNo,
  bridgeName,
  location,
  routeName,
  officeName,
}: {
  spanNo: number;
  managementNo: string | null;
  bridgeName: string | null;
  location: string | null;
  routeName: string | null;
  officeName: string | null;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-gray-400 bg-gray-50 p-3 text-xs dark:border-gray-600 dark:bg-gray-800 sm:grid-cols-3">
      <Field label="橋梁番号" value={managementNo} />
      <Field label="橋梁名" value={bridgeName} />
      <Field label="径間番号" value={String(spanNo)} />
      <Field label="所在地" value={location} />
      <Field label="路線名" value={routeName} />
      <Field label="事務所名" value={officeName} />
    </dl>
  );
}

// 径間ごとの損傷評価（定期点検調書（その４）径間N。床版・主桁・横桁等9項目
// ×判定区分/変状の種類）。様式１の総括表とは別に径間ごとに存在する
// （会話ログ「各径間ごとの判定を定期点検調書(その４)で行い...各径間ごとの
// 評価は、定期点検調書(その４)に書くという形」参照）。独立した「その４」
// タブ（form4）から使う。
function BridgeSpanDiagnosisTable({ diagnosis }: { diagnosis: BridgeInspectionSpanDiagnosis }) {
  return (
    <div className="overflow-x-auto border-b border-gray-300 p-3 dark:border-gray-700">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <Th className="whitespace-nowrap">部材等</Th>
            <Th className="whitespace-nowrap">判定区分</Th>
            <Th>変状の種類</Th>
          </tr>
        </thead>
        <tbody>
          {diagnosis.items.map((item, i) => (
            <tr key={`${item.memberName}-${i}`}>
              <Th className="whitespace-nowrap">{item.memberName}</Th>
              <Td className="whitespace-nowrap">
                {item.judgment ? (
                  <span
                    className={`rounded px-1.5 py-0.5 ${JUDGMENT_BADGE[item.judgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
                  >
                    {item.judgment}
                  </span>
                ) : (
                  "—"
                )}
              </Td>
              <Td>{item.damageType || "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 1径間分の内容（「径間N」タブの中身）。その５由来の損傷箇所カードを
// ページ（元Excelのシート1枚単位）ごとのサブタブに分けて表示する（会話ログ
// 「現在径間のみで一つのタブとしていますが、そうすると一つのタブが長く
// なります。そのため、径間１のタブの中にさらにタブを設けて定期点検調書
// (その５)の１、２と続けてください」参照。門型標識の様式２(1)(2)(3)と
// 同じ考え方を、径間タブの中でネストして使う）。
//
// その４（径間別の損傷評価）は、以前はこのタブの中にその５と地続きで
// 表示していたが、様式１〜その３と同じ「独立したタブ」の並びに無いため
// 見落とされ、「その4が実装されていない／読み込まれていない」と誤解される
// 事例があった（会話ログ「タブは様式１、２とその1、２、３と径間1のタブしか
// ありません。その4タブを用意してください」参照）。そのため、その４は独立
// タブ（form4）に分離し、このタブにはヘッダー情報とその５のみを残している。
function BridgeSpanPage({
  spanNo,
  managementNo,
  bridgeName,
  location,
  routeName,
  officeName,
  members,
}: {
  spanNo: number;
  managementNo: string | null;
  bridgeName: string | null;
  location: string | null;
  routeName: string | null;
  officeName: string | null;
  members: BridgeInspectionMember[];
}) {
  const pageGroups: { pageNo: number; members: BridgeInspectionMember[] }[] = [];
  for (const m of members) {
    let group = pageGroups.find((g) => g.pageNo === m.pageNo);
    if (!group) {
      group = { pageNo: m.pageNo, members: [] };
      pageGroups.push(group);
    }
    group.members.push(m);
  }
  pageGroups.sort((a, b) => a.pageNo - b.pageNo);

  return (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <BridgeSpanHeaderInfo
        spanNo={spanNo}
        managementNo={managementNo}
        bridgeName={bridgeName}
        location={location}
        routeName={routeName}
        officeName={officeName}
      />

      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">損傷箇所（その５）（{members.length}件）</h2>
      </div>
      {pageGroups.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">この径間には損傷記録がありません。</p>
      ) : (
        <div className="p-3">
          <SheetTabs
            tabs={pageGroups.map((g, i) => ({
              id: `page-${g.pageNo}`,
              label: `その５(${i + 1})`,
              content: <BridgeSpanCardGrid key={g.pageNo} members={g.members} />,
            }))}
          />
        </div>
      )}
    </section>
  );
}

// その５1ページ分の損傷箇所カード一覧（app/inspections/gate-signs/[id]/page.tsx
// のGateSignMemberPageと同じ「情報列を写真の左に置く」カード構成。橋梁は
// 判定区分・応急措置の概念が元Excelに無い（部材ごとの損傷記録のみ）ため、
// その分項目を減らしている）。
function BridgeSpanCardGrid({ members }: { members: BridgeInspectionMember[] }) {
  const photos = members
    .filter((m) => m.photoUrl)
    .map((m) => ({ id: m.id, url: m.photoUrl!, caption: [m.memberName, m.damageType].filter(Boolean).join(" / ") || null }));

  return (
    <PhotoLightboxGroup photos={photos}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {members.map((m) => {
          const photoIndex = photos.findIndex((p) => p.id === m.id);
          return (
            <div key={m.id} className="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
              <div className="flex flex-col md:flex-row">
                <div className="space-y-2 border-b border-gray-200 p-3 text-sm dark:border-gray-700 md:w-[42%] md:shrink-0 md:border-b-0 md:border-r">
                  {m.photoNo != null && (
                    <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      写真{m.photoNo}
                    </span>
                  )}
                  <Field label="部材名" value={[m.memberName, m.memberDetail].filter(Boolean).join(" / ") || null} />
                  <Field label="損傷種類" value={m.damageType} />
                </div>

                <div className="md:w-[58%]">
                  {m.photoUrl && photoIndex >= 0 ? (
                    <PhotoLightboxThumbnail index={photoIndex} className="block h-full w-full text-left">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.photoUrl}
                        alt={m.memberDetail ?? m.memberName ?? "損傷写真"}
                        className="aspect-[4/3] w-full cursor-zoom-in bg-gray-50 object-contain dark:bg-gray-800"
                      />
                    </PhotoLightboxThumbnail>
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
                      写真なし
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 border-t border-gray-200 p-3 text-sm dark:border-gray-700">
                <Field label="コメント" value={m.findings} />
              </div>
            </div>
          );
        })}
      </div>
    </PhotoLightboxGroup>
  );
}
