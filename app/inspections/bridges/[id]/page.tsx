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
import type {
  BridgeInspectionMemberOverviewRow,
  BridgeInspectionSpanDiagnosis,
} from "@/lib/excel/bridge-inspection-import";
import { Th, Td as BaseTd } from "@/components/ExcelTable";
import { JUDGMENT_BADGE } from "@/lib/labels";

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
  const overviewPhotos = insp.photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }));

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

  // 元Excel「道路橋様式１」「定期点検調書（その１）」の実際のセル配置を確認した
  // 上で作った表。門型標識の様式１と同じ考え方（ラベル上・値下の2行1組、
  // 6ユニット幅で統一。app/inspections/gate-signs/[id]/page.tsx参照）に揃えた
  // （会話ログ「橋梁点検調書の見え方はあなたが示すように門型標識で確立した
  // パターンを横展開してください」参照）。
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
            <Th>緯度経度</Th>
            <Th>管理番号（橋梁番号）</Th>
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
            <Td>
              {insp.latitude != null && insp.longitude != null
                ? formatLatLngDms(Number(insp.latitude), Number(insp.longitude))
                : "—"}
            </Td>
            <Td>{insp.managementNo || "—"}</Td>
          </tr>

          <tr>
            <Th>事務所名</Th>
            <Th>径間数</Th>
            <Th>点検日</Th>
            <Th>点検者</Th>
            <Th colSpan={2}>責任者</Th>
          </tr>
          <tr>
            <Td>{insp.officeName || "—"}</Td>
            <Td>{insp.spanCount != null ? String(insp.spanCount) : "—"}</Td>
            <Td>{insp.inspectionDate ? new Date(insp.inspectionDate).toLocaleDateString("ja-JP") : "—"}</Td>
            <Td>{insp.inspectorCompany || "—"}</Td>
            <Td colSpan={2}>{insp.responsiblePerson || "—"}</Td>
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

          {overviewPhotos.length > 0 && (
            <tr>
              <Th colSpan={6}>状況写真・橋梁一般図</Th>
            </tr>
          )}
          {overviewPhotos.length > 0 && (
            <tr>
              <td colSpan={6} className="border border-gray-400 bg-white p-2 align-top dark:border-gray-600 dark:bg-gray-900">
                <PhotoLightboxGroup photos={overviewPhotos}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {overviewPhotos.map((p, i) => (
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
        {insp.overallJudgment && (
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${JUDGMENT_BADGE[insp.overallJudgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
          >
            判定区分 {insp.overallJudgment}
          </span>
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
          ...spanNos.map((spanNo) => ({
            id: `span-${spanNo}`,
            label: `径間${spanNo}`,
            content: (
              <BridgeSpanPage
                key={spanNo}
                members={spanGroups.find((g) => g.spanNo === spanNo)?.members ?? []}
                diagnosis={spanDiagnoses.find((d) => d.spanNo === spanNo) ?? null}
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

// 径間ごとの損傷評価（定期点検調書（その４）径間N。床版・主桁・横桁等9項目
// ×判定区分/変状の種類）。様式１の総括表とは別に径間ごとに存在する
// （会話ログ「各径間ごとの判定を定期点検調書(その４)で行い...各径間ごとの
// 評価は、定期点検調書(その４)に書くという形」参照）。損傷箇所カード
// （その５）と同じ「径間N」タブの中に、カードより上に表示する。
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

// 1径間分の損傷箇所別カード一覧（「径間N」タブの中身。
// app/inspections/gate-signs/[id]/page.tsxのGateSignMemberPageと同じ
// 「情報列を写真の左に置く」カード構成。橋梁は判定区分・応急措置の概念が
// 元Excelに無い（部材ごとの損傷記録のみ）ため、その分項目を減らしている）。
function BridgeSpanPage({ members, diagnosis }: { members: BridgeInspectionMember[]; diagnosis: BridgeInspectionSpanDiagnosis | null }) {
  const photos = members
    .filter((m) => m.photoUrl)
    .map((m) => ({ id: m.id, url: m.photoUrl!, caption: [m.memberName, m.damageType].filter(Boolean).join(" / ") || null }));

  return (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">損傷評価・損傷箇所（{members.length}件）</h2>
      </div>
      {diagnosis && <BridgeSpanDiagnosisTable diagnosis={diagnosis} />}
      {members.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">この径間には損傷記録がありません。</p>
      ) : (
        <PhotoLightboxGroup photos={photos}>
          <div className="grid grid-cols-1 gap-4 p-3 lg:grid-cols-2">
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
      )}
    </section>
  );
}
