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
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

const JUDGMENT_BADGE: Record<string, string> = {
  Ⅰ: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  Ⅱ: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  Ⅲ: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  Ⅳ: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

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
    },
  });
  if (!insp) notFound();

  const title = insp.bridgeName ?? insp.managementNo ?? insp.sourceFileName ?? "（橋梁名不明）";
  const overviewPhotos = insp.photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }));

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

  const form1 = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">基本情報（様式１）</h2>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
        <Field label="橋梁名" value={insp.bridgeName} />
        <Field label="（フリガナ）" value={insp.bridgeNameKana} />
        <Field
          label="路線名"
          value={insp.routeName}
          // 橋梁は施設台帳タブ上「橋梁」に分類される
          // （lib/facility-taxonomy.tsのFACILITY_LEDGER_ITEM_TYPES.road参照）。
          href={insp.routeName ? buildFacilityRouteSearchHref(insp.routeName, "橋梁") : undefined}
        />
        <Field label="所在地" value={insp.location} />
        <Field label="事務所名" value={insp.officeName} />
        <Field label="管理番号（橋梁番号）" value={insp.managementNo} />
        <Field label="径間数" value={insp.spanCount != null ? String(insp.spanCount) : null} />
        <Field
          label="緯度経度"
          value={insp.latitude != null && insp.longitude != null ? `${insp.latitude}, ${insp.longitude}` : null}
        />
        <Field
          label="点検日"
          value={insp.inspectionDate ? new Date(insp.inspectionDate).toLocaleDateString("ja-JP") : null}
        />
        <Field label="点検者" value={insp.inspectorCompany} />
        <Field label="責任者" value={insp.responsiblePerson} />
        <div className="sm:col-span-2">
          <Field label="道路橋毎の健全性の診断（所見）" value={insp.overallFindings} />
        </div>
      </dl>

      {overviewPhotos.length > 0 && (
        <div className="border-t border-gray-300 p-4 dark:border-gray-700">
          <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            状況写真・橋梁一般図（{overviewPhotos.length}枚）
          </h3>
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
        </div>
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

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{title}</h1>
        {insp.overallJudgment && (
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${JUDGMENT_BADGE[insp.overallJudgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
          >
            判定区分 {insp.overallJudgment}
          </span>
        )}
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

      <SheetTabs
        tabs={[
          { id: "form1", label: "様式１", content: form1 },
          ...spanGroups.map((g) => ({
            id: `span-${g.spanNo}`,
            label: `径間${g.spanNo}`,
            content: <BridgeSpanPage key={g.spanNo} members={g.members} />,
          })),
        ]}
      />

      <form action={deleteBridgeInspection.bind(null, insp.id)}>
        <ConfirmSubmitButton
          message={`「${title}」を削除しますか？（元に戻せません）`}
          pendingLabel="削除中..."
          className="text-sm text-red-600 hover:underline dark:text-red-400"
        >
          この点検調書を削除
        </ConfirmSubmitButton>
      </form>
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

// 1径間分の損傷箇所別カード一覧（「径間N」タブの中身。
// app/inspections/gate-signs/[id]/page.tsxのGateSignMemberPageと同じ
// 「情報列を写真の左に置く」カード構成。橋梁は判定区分・応急措置の概念が
// 元Excelに無い（部材ごとの損傷記録のみ）ため、その分項目を減らしている）。
function BridgeSpanPage({ members }: { members: BridgeInspectionMember[] }) {
  const photos = members
    .filter((m) => m.photoUrl)
    .map((m) => ({ id: m.id, url: m.photoUrl!, caption: [m.memberName, m.damageType].filter(Boolean).join(" / ") || null }));

  return (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">損傷箇所（{members.length}件）</h2>
      </div>
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
