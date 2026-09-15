import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { GateSignInspection, GateSignInspectionMember } from "@prisma/client";
import { deleteGateSignInspection } from "@/lib/actions/gate-sign-inspection-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import RecordViewHistory from "@/components/RecordViewHistory";
import { PhotoLightboxGroup, PhotoLightboxThumbnail } from "@/components/PhotoLightbox";
import SheetTabs from "@/components/SheetTabs";

export const dynamic = "force-dynamic";

const JUDGMENT_BADGE: Record<string, string> = {
  Ⅰ: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  Ⅱ: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  Ⅲ: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  Ⅳ: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

// 点検調書（道路＞門型標識）1件の詳細画面（会話ログ参照）。様式（その１）
// 相当の基本情報タブと、様式（その２）相当（状況写真・損傷箇所ごとの詳細）の
// タブを、元Excelのシート構成のまま「様式１」「様式２(1)」「様式２(2)」…と
// 横並びに切り替えるタブ表示にする（karte詳細画面の様式Ａ〜Ｄ・現状記録写真と
// 同じ、1つのSheetTabsに全シートをまとめる構成。会話ログ「様式1と様式２を
// 縦に並べるのではなく...様式１、様式２(1)、様式2(２)というようにタブで
// 表示してください」参照。以前は様式１・様式２を別々のセクションとして縦に
// 並べ、様式２の中だけをタブで分けていた）。
export default async function GateSignInspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const insp = await prisma.gateSignInspection.findUnique({
    where: { id },
    include: {
      overviewPhotos: { orderBy: { sortOrder: "asc" } },
      members: { orderBy: { sortOrder: "asc" } },
      facilityListItem: { select: { id: true, managementNo: true, routeName: true, location: true } },
    },
  });
  if (!insp) notFound();

  const title = insp.managementNo ?? insp.sourceFileName ?? "（管理番号不明）";
  const overviewLightboxPhotos = insp.overviewPhotos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }));

  // 元Excelの「状況写真（損傷状況）」シート（様式（その２）／様式（その２）2／
  // 様式（その２）3…）ごとにタブを分ける（会話ログ「エクセルに合わせて、状況写真の
  // タブを３つ作ってください...タブが4つ5つあるものは、それに合わせて複数作成
  // できる仕様に」参照）。pageNoでグループ化する
  // （lib/excel/gate-sign-inspection-import.ts参照）。
  const pageGroups: { pageNo: number; members: GateSignInspectionMember[] }[] = [];
  for (const m of insp.members) {
    let group = pageGroups.find((g) => g.pageNo === m.pageNo);
    if (!group) {
      group = { pageNo: m.pageNo, members: [] };
      pageGroups.push(group);
    }
    group.members.push(m);
  }
  pageGroups.sort((a, b) => a.pageNo - b.pageNo);

  const form1 = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">基本情報（様式１）</h2>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
        <Field label="施設名" value={insp.facilityName} />
        <Field label="形式" value={insp.facilityForm} />
        <Field label="路線名" value={insp.routeName} />
        <Field label="所在地" value={insp.location} />
        <Field
          label="緯度経度"
          value={insp.latitude != null && insp.longitude != null ? `${insp.latitude}, ${insp.longitude}` : null}
        />
        <Field
          label="定期点検実施年月日"
          value={insp.inspectionDate ? new Date(insp.inspectionDate).toLocaleDateString("ja-JP") : null}
        />
        <Field label="定期点検者" value={insp.inspectorCompany} />
        <Field label="記録者" value={insp.inspectorName} />
        <Field label="管理者名" value={insp.managerOrgName} />
        <Field label="代替路の有無" value={insp.hasAlternateRoute} />
        <Field label="緊急輸送道路" value={insp.emergencyTransportRoad} />
        <Field label="自専道or一般道" value={insp.roadCategory} />
        <Field label="占用物件" value={insp.occupyingObjects} />
        <Field
          label="設置年月"
          value={insp.installedYear ? `${insp.installedYear}年${insp.installedMonth ?? ""}月` : null}
        />
        <Field label="道路幅員(ｍ)" value={insp.roadWidthM != null ? String(insp.roadWidthM) : null} />
        <Field label="構造形式" value={insp.structureType} />
        <div className="sm:col-span-2">
          <Field label="門型標識等毎の健全性の診断（所見）" value={insp.overallFindings} />
        </div>
      </dl>

      {overviewLightboxPhotos.length > 0 && (
        <div className="border-t border-gray-300 p-4 dark:border-gray-700">
          <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">全景写真</h3>
          {/* 元Excelでは左＝起点側、右＝終点側の並びで貼り付けられており
              （extractForm1OverviewPhotosで列位置ソート済み）、この並び順自体は
              維持されているが、キャプション文字列がalt/titleにしか入っておらず
              画面上に見えていなかったため、起終点のどちらか一目で分からなかった
              （会話ログ「起終点がどちらかわかるように配置してください」参照）。
              写真の下にキャプションを常時表示する（karte詳細画面の「現状記録写真」
              タブと同じ見せ方）。 */}
          <PhotoLightboxGroup photos={overviewLightboxPhotos}>
            <div className="grid grid-cols-2 gap-3">
              {overviewLightboxPhotos.map((p, i) => (
                <div key={p.id}>
                  <PhotoLightboxThumbnail index={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption ?? "全景写真"}
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
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <RecordViewHistory
        kind="gate_sign_inspection"
        id={insp.id}
        title={title}
        subtitle={insp.routeName ?? undefined}
        href={`/inspections/gate-signs/${insp.id}`}
      />
      <Link href="/inspections/gate-signs" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 点検調書（門型標識）一覧に戻る
      </Link>

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
          施設台帳と未紐付け（ファイル名の管理番号が施設台帳のいずれの行とも一致しませんでした）
        </p>
      )}

      <SheetTabs
        tabs={[
          { id: "form1", label: "様式１", content: form1 },
          ...pageGroups.map((g, i) => ({
            id: `form2-${g.pageNo}`,
            label: `様式２(${i + 1})`,
            content: <GateSignMemberPage key={g.pageNo} inspection={insp} members={g.members} />,
          })),
        ]}
      />

      <form action={deleteGateSignInspection.bind(null, insp.id)}>
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

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">{value ?? "—"}</dd>
    </div>
  );
}

// 状況写真（損傷状況）の1ページ分（＝元Excelの様式（その２）系シート1枚分。
// 「様式２(n)」タブの中身）。karte詳細画面の「現状記録写真」タブと同じ考え方:
// 上部に基礎情報の一部（元Excelの各ページに繰り返し出てくるヘッダー相当）を出し、
// その下に写真を2×2で並べる（会話ログ「上に基礎情報の一部が表示され、2×2で
// 写真が配置され、部材名、変状の種類、健全性の診断、応急処置、所見、備考欄を
// 作ってください」参照）。members.length===0の場合（損傷カード無し＝判定区分Ⅰ）
// も、タブ自体はpageGroupsが無ければ生成されない＝様式２(n)自体が存在しない
// ため、ここでの「このページには損傷カードがありません」表示は実質発生しない
// （念のためのフォールバックとして残す）。
function GateSignMemberPage({
  inspection,
  members,
}: {
  inspection: Pick<GateSignInspection, "facilityName" | "facilityForm" | "routeName" | "inspectorCompany" | "inspectionDate">;
  members: GateSignInspectionMember[];
}) {
  const photos = members.filter((m) => m.photoUrl).map((m) => ({ id: m.id, url: m.photoUrl!, caption: m.memberDetail ?? m.memberName }));

  return (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">状況写真（損傷状況）（{members.length}件）</h2>
      </div>
      {/* 基礎情報の一部（元Excelの様式２各ページに繰り返し出てくるヘッダー相当）。
          全項目の詳細は「様式１」タブに一元化してあるため、ここではそのページの
          写真がどの施設・いつの点検かがすぐ分かる程度の抜粋に絞る。 */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-800 sm:grid-cols-4">
        <Field
          label="施設名（形式）"
          value={
            inspection.facilityForm
              ? `${inspection.facilityName ?? ""}（${inspection.facilityForm}）`
              : inspection.facilityName
          }
        />
        <Field label="路線名" value={inspection.routeName} />
        <Field label="定期点検者" value={inspection.inspectorCompany} />
        <Field
          label="点検年月日"
          value={inspection.inspectionDate ? new Date(inspection.inspectionDate).toLocaleDateString("ja-JP") : null}
        />
      </dl>

      {members.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">このページには損傷カードがありません。</p>
      ) : (
        <PhotoLightboxGroup photos={photos}>
          {/* 元Excelでは、1件の損傷カードが「写真番号・部材名・変状の種類・健全性の
              診断（ラベル列＋値列、A7:E12相当）」と「写真（F7:L12相当）」が左右に
              並ぶ横長の構成で、そのカードが1シートに2件ずつ（写真番号1・2が1行、
              3・4がもう1行）並ぶ。以前はカード内で写真を上・説明文を下に縦積みして
              いたため、Excelでは横長のカードがWeb上では縦長になってしまっていた
              （会話ログ「エクセルでは基本的に四つの要素が並んで全体としては横長
              ですが、Web上では縦長となっています…画像とその説明を縦に並べている
              ため」参照）。情報列を写真の左に横並びにし、カード同士もlg以上でのみ
              2列にすることで、Excelの見た目に近づけている。 */}
          <div className="grid grid-cols-1 gap-4 p-3 lg:grid-cols-2">
            {members.map((m) => {
              const photoIndex = photos.findIndex((p) => p.id === m.id);
              return (
                <div key={m.id} className="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col md:flex-row">
                    {/* 情報列（Excel A7:E12相当）: 写真の"左"に配置する */}
                    <div className="space-y-2 border-b border-gray-200 p-3 text-sm dark:border-gray-700 md:w-[42%] md:shrink-0 md:border-b-0 md:border-r">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {m.photoNo != null && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            写真{m.photoNo}
                          </span>
                        )}
                      </div>
                      <Field label="部材名" value={[m.memberName, m.memberDetail].filter(Boolean).join(" / ") || null} />
                      <Field label="変状の種類" value={m.damageType} />
                      <div>
                        <dt className="text-xs text-gray-400 dark:text-gray-500">健全性の診断</dt>
                        <dd className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="flex items-center gap-1">
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">定期点検時</span>
                            {m.judgment ? (
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs ${JUDGMENT_BADGE[m.judgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
                              >
                                {m.judgment}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                            )}
                          </span>
                          {m.postActionJudgment && (
                            <span className="flex items-center gap-1">
                              <span className="text-[11px] text-gray-500 dark:text-gray-400">応急措置後</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs ${JUDGMENT_BADGE[m.postActionJudgment] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
                              >
                                {m.postActionJudgment}
                              </span>
                            </span>
                          )}
                        </dd>
                      </div>
                    </div>

                    {/* 写真（Excel F7:L12相当）: 情報列の"右"に配置する */}
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

                  {/* 応急処置内容・所見・備考欄（Excel D13:L13等相当）:
                      情報列・写真の両方の下に、カード幅いっぱいで配置する */}
                  <div className="space-y-1.5 border-t border-gray-200 p-3 text-sm dark:border-gray-700">
                    <Field label="応急処置内容" value={m.postActionContent} />
                    <Field label="所見" value={m.findings} />
                    <Field label="備考欄" value={m.remarks} />
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
