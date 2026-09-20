import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { GateSignInspection, GateSignInspectionMember } from "@prisma/client";
import { deleteGateSignInspection } from "@/lib/actions/gate-sign-inspection-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import RecordViewHistory from "@/components/RecordViewHistory";
import { PhotoLightboxGroup, PhotoLightboxThumbnail } from "@/components/PhotoLightbox";
import SheetTabs from "@/components/SheetTabs";
import { buildFacilityRouteSearchHref } from "@/lib/facility-taxonomy";
import { formatLatLngDms } from "@/lib/geo";
import type { GateSignInspectionMemberOverviewRow } from "@/lib/excel/gate-sign-inspection-import";
import BackLink from "@/components/BackLink";
import FavoriteToggleButton from "@/components/FavoriteToggleButton";

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
      favorite: { select: { id: true } },
      supersededByInspection: { select: { id: true } },
    },
  });
  if (!insp) notFound();

  const title = insp.managementNo ?? insp.sourceFileName ?? "（管理番号不明）";

  // 年度別履歴（会話ログ「点検年度ごとに履歴として保存する」参照。schema.prismaの
  // GateSignInspection.previousInspectionIdコメント参照）。previousInspectionIdを
  // 遡って過去年度分の一覧を作る（現在の画面が最新かどうかに関わらず、常に
  // 「このレコードより古い年度」を列挙する）。
  const pastYears: { id: string; inspectionDate: Date | null; sourceFileName: string | null }[] = [];
  {
    let cursor = insp.previousInspectionId;
    while (cursor) {
      const past: { id: string; inspectionDate: Date | null; sourceFileName: string | null; previousInspectionId: string | null } | null =
        await prisma.gateSignInspection.findUnique({
          where: { id: cursor },
          select: { id: true, inspectionDate: true, sourceFileName: true, previousInspectionId: true },
        });
      if (!past) break;
      pastYears.push(past);
      cursor = past.previousInspectionId;
    }
  }
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

  // 元Excel「様式（その１）」の実際のセル配置を直接確認した上で作った表
  // （会話ログ「門型標識の点検調書の表示はエクセルとWebで大きく乖離している…
  // エクセル上での表示を確認して、一列にどのような要素を並べているのかを
  // 確認して、それと同じようにWeb上でも表示するようにしてください」参照）。
  //
  // Excelでは項目名（ラベル）とその内容（値）が横並びではなく、ラベルの行の
  // 直下に値の行が来る構成になっている（例: 「施設名・形式」という見出し行の
  // 下に「道路標識」「門型式」という値の行が来る）。そのため各グループを
  // 「ラベルの行＋値の行」の2行1組として表現している（会話ログ「項目の横に、
  // その内容が表示されているようですが、エクセルと同じように項目の下にその
  // 内容を表示する形にしてほしい」参照。以前はTh/Tdを同じ行に横並びさせていた）。
  // 表の横幅は6ユニット固定（1ユニット=ラベル+値のペア1組分）で統一し、
  // フィールド数が6に満たないグループは末尾のセルのcolSpanで埋めている。
  // 施設名・形式・路線名・所在地・設置位置・ID番号の行はちょうど6項目で
  // 自然に埋まる（会話ログ「緯度経度の項目は...他の列とは独立して位置して
  // いますね。見た感じ不自然なので、設置位置専用の列とならないように...
  // それ以降の行も調節してください」参照。以前は5ユニットで統一していたため
  // この行だけが浮いて見えていた。ID番号を追加して6項目ちょうどに揃えた上で、
  // 他の行も全て6ユニットに合わせている）。
  //
  // 「設置位置」はExcel上、緯度・経度をまとめる見出しラベルとして実在する
  // （様式（その１）M4:M5セル。会話ログ「設置位置は、緯度経度のことを
  // 指しています。したがって、現在、緯度経度という項目としているところを、
  // 設置位置に変えてください」参照。値自体はIMS設定シート由来の10進度を
  // lib/geo.tsのformatLatLngDmsで度分秒表記に戻したもの。他の画面と同じ方式）。
  //
  // 【行の対応関係（Excel行番号は1始まり）】
  //   行4/6: 施設名・形式・路線名・所在地・設置位置（緯度経度）・ID番号
  //          （ID番号はQ4:R4セル。実データでは空欄のことが多い）
  //   行8/9: 定期点検実施年月日・定期点検者・記録者・管理者名
  //   行10/11: 代替路の有無・緊急輸送道路・自専道or一般道・占用物件
  //   行13-20: 部材単位の健全性の診断（支柱・横梁・標識板または道路情報板・
  //          基礎・その他の5部材×6項目の総括表）。様式（その２）の詳細カードと
  //          内容が重なるが、様式１タブは概要表示という位置づけのため表示する
  //          （会話ログ「様式1は概要を表示するという観点で部材ごとの健全性の
  //          診断も表示してほしい」参照。GateSignInspection.memberOverview、
  //          lib/excel/gate-sign-inspection-import.tsのコメント参照）。
  //   行22-25: 門型標識等毎の健全性の診断（判定区分・所見）
  //   行27-30: 設置年月・道路幅員・構造形式、および起点側・終点側の全景写真
  //          （Excel上でも全景写真はこの並びの直後に配置されている）。
  const memberOverview = (insp.memberOverview as unknown as GateSignInspectionMemberOverviewRow[] | null) ?? [];

  const form1 = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">基本情報（様式１）</h2>
      </div>

      <table className="w-full border-collapse text-xs">
        <tbody>
          <tr>
            <Th>施設名</Th>
            <Th>形式</Th>
            <Th>路線名</Th>
            <Th>所在地</Th>
            <Th>設置位置</Th>
            <Th>ID番号</Th>
          </tr>
          <tr>
            <Td>{insp.facilityName || "—"}</Td>
            <Td>{insp.facilityForm || "—"}</Td>
            <Td>
              {insp.routeName ? (
                // 門型標識は施設台帳タブ上「道路標識」に分類される
                // （lib/facility-taxonomy.tsのFACILITY_LEDGER_ITEM_TYPES.road参照）。
                <Link
                  href={buildFacilityRouteSearchHref(insp.routeName, "道路標識")}
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
            <Td>{insp.idNumber || "—"}</Td>
          </tr>

          <tr>
            <Th>定期点検実施年月日</Th>
            <Th>定期点検者</Th>
            <Th>記録者</Th>
            <Th colSpan={3}>管理者名</Th>
          </tr>
          <tr>
            <Td>{insp.inspectionDate ? new Date(insp.inspectionDate).toLocaleDateString("ja-JP") : "—"}</Td>
            <Td>{insp.inspectorCompany || "—"}</Td>
            <Td>{insp.inspectorName || "—"}</Td>
            <Td colSpan={3}>{insp.managerOrgName || "—"}</Td>
          </tr>

          <tr>
            <Th>代替路の有無</Th>
            <Th>緊急輸送道路</Th>
            <Th>自専道or一般道</Th>
            <Th colSpan={3}>占用物件</Th>
          </tr>
          <tr>
            <Td>{insp.hasAlternateRoute || "—"}</Td>
            <Td>{insp.emergencyTransportRoad || "—"}</Td>
            <Td>{insp.roadCategory || "—"}</Td>
            <Td colSpan={3}>{insp.occupyingObjects || "—"}</Td>
          </tr>

          {memberOverview.length > 0 && (
            <tr>
              <Th colSpan={6}>部材単位の健全性の診断（部材毎に最も厳しい健全性の診断結果を記入）</Th>
            </tr>
          )}
          {memberOverview.length > 0 && (
            <tr>
              <td colSpan={6} className="border border-gray-400 p-0 dark:border-gray-600">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <Th className="whitespace-nowrap">部材等</Th>
                      <Th className="whitespace-nowrap">判定区分</Th>
                      <Th className="whitespace-nowrap">変状の種類</Th>
                      <Th>備考</Th>
                      <Th className="whitespace-nowrap">応急措置後の判定区分</Th>
                      <Th>応急措置内容</Th>
                      <Th className="whitespace-nowrap">応急措置及び判定実施年月日</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberOverview.map((m) => (
                      <tr key={m.memberName}>
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
            <Th colSpan={6}>門型標識等毎の健全性の診断</Th>
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
            <Th>設置年月</Th>
            <Th>道路幅員(ｍ)</Th>
            <Th colSpan={4}>構造形式</Th>
          </tr>
          <tr>
            <Td>{insp.installedYear ? `${insp.installedYear}年${insp.installedMonth ?? ""}月` : "—"}</Td>
            <Td>{insp.roadWidthM != null ? String(insp.roadWidthM) : "—"}</Td>
            <Td colSpan={4}>{insp.structureType || "—"}</Td>
          </tr>

          <tr>
            <Th colSpan={6}>全景写真</Th>
          </tr>
          <tr>
            <td colSpan={6} className="border border-gray-400 bg-white p-2 align-top dark:border-gray-600 dark:bg-gray-900">
              {overviewLightboxPhotos.length > 0 ? (
                // 元Excelでは左＝起点側、右＝終点側の並びで貼り付けられており
                // （extractForm1OverviewPhotosで列位置ソート済み）、この並び順自体は
                // 維持されているが、キャプション文字列がalt/titleにしか入っておらず
                // 画面上に見えていなかったため、起終点のどちらか一目で分からなかった
                // （会話ログ「起終点がどちらかわかるように配置してください」参照）。
                // 写真の下にキャプションを常時表示する（karte詳細画面の「現状記録写真」
                // タブと同じ見せ方）。
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
              ) : (
                "—"
              )}
            </td>
          </tr>
        </tbody>
      </table>
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
      <BackLink fallbackHref="/inspections/gate-signs">
        ← 点検調書（門型標識）一覧に戻る
      </BackLink>

      {insp.supersededByInspection && (
        // このレコードより新しい年度の記録が存在する場合の案内（会話ログ「点検
        // 年度ごとに履歴として保存する」参照）。リダイレクトはせず、このページ
        // 自体は過去年度のデータとしてそのまま表示し続ける（URLが無効にならない
        // ようにするため。schema.prismaのGateSignInspection.previousInspectionId
        // コメント参照）。
        <p className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
          これは過去年度の記録です。
          <Link href={`/inspections/gate-signs/${insp.supersededByInspection.id}`} className="ml-1 underline">
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
          target={{ type: "gateSignInspection", id: insp.id }}
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
          施設台帳と未紐付け（ファイル名の管理番号が施設台帳のいずれの行とも一致しませんでした）
        </p>
      )}

      {pastYears.length > 0 && (
        // 年度別履歴（会話ログ「点検年度ごとに履歴として保存する」参照）。
        <div className="rounded border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">過去の点検履歴</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {pastYears.map((p) => (
              <li key={p.id}>
                <Link href={`/inspections/gate-signs/${p.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
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
          ...pageGroups.map((g, i) => ({
            id: `form2-${g.pageNo}`,
            label: `様式２(${i + 1})`,
            content: <GateSignMemberPage key={g.pageNo} inspection={insp} members={g.members} />,
          })),
        ]}
      />

      {!insp.supersededByInspection && (
        // 削除は「最新レコードから履歴チェーン全体を遡って削除する」実装
        // （lib/actions/gate-sign-inspection-actions.tsのdeleteGateSignInspection
        // 参照）のため、過去年度のページには削除ボタンを出さない（そこから
        // 削除すると、それより新しい年度が孤立して残ってしまうため）。
        <form action={deleteGateSignInspection.bind(null, insp.id)}>
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
  // 値をクリック可能にする場合のリンク先（会話ログ「路線名をクリックして、
  // その路線の関連施設を表示」参照。路線名Fieldにのみ渡す）。
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

// 様式１タブの表で使うセル。karte詳細画面の様式Ａ・様式Ｂ（app/karte/[karteNo]/page.tsx）
// と同じ見た目にするため、同じクラス構成のTh/Tdをこちらにも定義している
// （ファイルをまたいで共有するほどの複雑さではないため、単純に複製している）。
function Th({
  children,
  colSpan,
  className = "",
}: {
  children: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <th
      colSpan={colSpan}
      className={`border border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-1 text-left align-middle font-medium whitespace-nowrap text-gray-600 dark:text-gray-300 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  colSpan,
  className = "",
}: {
  children: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 align-top whitespace-pre-wrap ${className}`}
    >
      {children}
    </td>
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
        <Field
          label="路線名"
          value={inspection.routeName}
          href={inspection.routeName ? buildFacilityRouteSearchHref(inspection.routeName, "道路標識") : undefined}
        />
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
