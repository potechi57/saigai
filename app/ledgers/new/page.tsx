import { prisma } from "@/lib/prisma";
import { formatFacilityType } from "@/lib/labels";
import { FACILITY_LEDGER_ITEM_FIELDS, FACILITY_LEDGER_ITEM_TYPES, type FieldKey } from "@/lib/facility-taxonomy";
import FacilityLedgerForm from "@/components/FacilityLedgerForm";
import PendingLink from "@/components/PendingLink";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// 台帳（画像）の登録画面。読み込み実務ではおそらく、先に施設台帳（一覧表）で
// 対象施設を登録しておき、その後に台帳画像を貼り付ける、という順序になる
// との指摘を受け、施設台帳から対象を選ぶと、台帳名・路線名・所在地・緯度経度を
// 自動入力できるようにしている（会話ログ参照）。選択は必須ではなく、
// 施設台帳に無い対象は従来通り手入力できる。
// FacilityLedgerとFacilityListItemの間にDB上の関連は持たせていない
// （現状はあくまで新規登録時の入力補助。将来的に紐付けが必要になった場合は
// 別途検討する）。
//
// 施設台帳は件数が多く（数百件規模）、以前は単純に「直近200件を管理番号順で
// 並べただけの1つの<select>」から選ばせていたが、目的の施設を探すのが困難だった
// （会話ログ「施設台帳一覧からの名称を使用するなら...現状のスライド形式では
// 探しにくいです」参照）。検索・地図画面の施設台帳タブと同じ「分野→施設名称」の
// 絞り込み（FACILITY_LEDGER_ITEM_FIELDS/TYPES。lib/facility-taxonomy.ts）に、
// 路線名の絞り込みを組み合わせ、最後に絞り込まれた候補だけを<select>で選ばせる
// 3段階のピッカーに作り直した。
export default async function NewFacilityLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ facilityId?: string; docClass?: string; bunya?: string; shisetsu?: string; routeName?: string }>;
}) {
  const { facilityId, docClass, bunya, shisetsu, routeName } = await searchParams;
  // 資料読み込みハブ（/import?method=image&cat=ledger|facility）・台帳一覧の
  // 「＋法令台帳として登録」「＋施設台帳として登録」から来た場合、どちらの分類で
  // 画像登録しようとしていたかをフォームの初期選択に反映する（app/import/page.tsx・
  // app/ledgers/page.tsx参照）。docClassの指定が無いまま直接このURLを開いた場合は
  // どちらも初期選択しない（undefined）。以前はここで無言で「施設台帳」を既定に
  // していたが、これが原因で法令台帳のつもりで登録した台帳が施設台帳として保存され、
  // 検索で見つからなくなる事例が発生した（会話ログ「法令台帳として登録したものが、
  // なぜか施設台帳に登録されているのかもしれません」参照）。
  const initialDocClass: "LEGAL" | "FACILITY" | undefined =
    docClass === "LEGAL" ? "LEGAL" : docClass === "FACILITY" ? "FACILITY" : undefined;

  const shisetsuDef = bunya && shisetsu ? FACILITY_LEDGER_ITEM_TYPES[bunya]?.find((t) => t.label === shisetsu) : undefined;

  // 分野・施設名称（細別）まで選び切り、かつ実データが紐付く場合だけ候補を取得する
  // （検索・地図画面の施設台帳タブと同じ方針。細別未選択のまま全件を出すと、結局
  // 従来の「探しにくい」状態に逆戻りしてしまうため）。
  const matchedCandidates = shisetsuDef?.match
    ? await prisma.facilityListItem.findMany({
        where: {
          OR: shisetsuDef.match.flatMap((kw) => [
            { facilityType: { contains: kw } },
            { facilitySubType: { contains: kw } },
          ]),
        },
        orderBy: { managementNo: "asc" },
        take: 500,
        select: {
          id: true,
          managementNo: true,
          facilityType: true,
          facilitySubType: true,
          routeName: true,
          location: true,
          latitude: true,
          longitude: true,
        },
      })
    : [];

  // 絞り込んだ候補の中から、実際に使われている路線名だけを選択肢にする
  // （施設台帳タブの路線名選択と同じ考え方。全件から集めるとここでも件数過多に
  // なるため、分野・施設名称で絞った後の候補に限定する）。
  const routeNameOptions = Array.from(
    new Set(matchedCandidates.map((f) => f.routeName).filter((v): v is string => !!v))
  ).sort((a, b) => a.localeCompare(b, "ja"));

  const finalCandidates = routeName ? matchedCandidates.filter((f) => f.routeName === routeName) : matchedCandidates;

  const selected = facilityId ? matchedCandidates.find((f) => f.id === facilityId) : undefined;
  const initial = selected
    ? {
        managementNo: selected.managementNo,
        name: formatFacilityType(selected.facilityType, selected.facilitySubType) ?? "",
        routeName: selected.routeName ?? "",
        location: selected.location ?? "",
        latitude: selected.latitude != null ? String(selected.latitude) : "",
        longitude: selected.longitude != null ? String(selected.longitude) : "",
      }
    : undefined;

  // ドリルダウンのリンク先。分野を切り替えたら施設名称・路線名・選択中の施設を
  // クリアする（別の分野の絞り込みが残らないようにするため。検索画面の
  // facilityFieldHref等と同じ考え方）。
  const bunyaHref = (key: string) => {
    const usp = new URLSearchParams();
    if (docClass) usp.set("docClass", docClass);
    usp.set("bunya", key);
    return `/ledgers/new?${usp.toString()}`;
  };
  const shisetsuHref = (key: string, label: string) => {
    const usp = new URLSearchParams();
    if (docClass) usp.set("docClass", docClass);
    usp.set("bunya", key);
    usp.set("shisetsu", label);
    return `/ledgers/new?${usp.toString()}`;
  };
  const clearDrilldownHref = (() => {
    const usp = new URLSearchParams();
    if (docClass) usp.set("docClass", docClass);
    return `/ledgers/new?${usp.toString()}`;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <BackLink fallbackHref="/ledgers">
        ← 台帳一覧に戻る
      </BackLink>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">台帳（画像）を登録</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Excelのような構造化データが無く、スキャン画像でしか残っていない台帳（トンネル台帳等）を登録します。緯度経度を入力すると、地図（検索・一覧画面）にもピンで表示されます。
      </p>

      <div className="space-y-3 rounded border border-gray-300 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">施設台帳から選んで自動入力（任意）</span>
          {(bunya || shisetsu) && (
            <PendingLink href={clearDrilldownHref} className="text-xs text-gray-400 hover:underline dark:text-gray-500">
              絞り込みをクリア
            </PendingLink>
          )}
        </div>

        {/* --- 1段階目: 分野 --- */}
        <div className="flex flex-wrap gap-1.5">
          {FACILITY_LEDGER_ITEM_FIELDS.map((f) => (
            <PendingLink
              key={f.key}
              href={bunyaHref(f.key)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                bunya === f.key
                  ? "border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900"
                  : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
              }`}
            >
              {f.label}
            </PendingLink>
          ))}
        </div>

        {/* --- 2段階目: 施設名称（細別） --- */}
        {bunya && (
          <div className="flex flex-wrap gap-1.5 border-l-2 border-gray-300 pl-2 dark:border-gray-600">
            {(FACILITY_LEDGER_ITEM_TYPES[bunya as FieldKey] ?? []).map((t) => (
              <PendingLink
                key={t.label}
                href={shisetsuHref(bunya, t.label)}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  shisetsu === t.label
                    ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500"
                    : t.match
                      ? "border-gray-300 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                      : "border-dashed border-gray-300 bg-white text-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-600"
                }`}
              >
                {t.label}
                {!t.match && "（準備中）"}
              </PendingLink>
            ))}
          </div>
        )}

        {/* --- 3段階目: 路線名（任意の絞り込み）＋具体的な施設の選択 --- */}
        {bunya && shisetsu && !shisetsuDef?.match && (
          <p className="rounded border border-dashed border-gray-300 bg-white p-2 text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
            準備中です。この施設名称はまだ施設台帳の検索に対応していません。
          </p>
        )}
        {shisetsuDef?.match && (
          <form method="GET" className="space-y-2">
            {docClass && <input type="hidden" name="docClass" value={docClass} />}
            <input type="hidden" name="bunya" value={bunya} />
            <input type="hidden" name="shisetsu" value={shisetsu} />
            {routeNameOptions.length > 0 && (
              <div className="flex gap-2">
                <select
                  name="routeName"
                  defaultValue={routeName ?? ""}
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">路線名ですべて表示（{matchedCandidates.length}件）</option>
                  {routeNameOptions.map((rn) => (
                    <option key={rn} value={rn}>
                      {rn}（
                      {matchedCandidates.filter((f) => f.routeName === rn).length}件）
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="shrink-0 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  絞り込む
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <select
                name="facilityId"
                defaultValue={facilityId ?? ""}
                className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">
                  {finalCandidates.length === 0 ? "該当する施設がありません" : `選択してください（${finalCandidates.length}件）`}
                </option>
                {finalCandidates.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.managementNo}
                    {f.location ? ` - ${f.location}` : ""}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="shrink-0 rounded bg-gray-800 dark:bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600"
              >
                自動入力
              </button>
            </div>
          </form>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          分野→施設名称（→路線名）の順に絞り込んでから選ぶと、台帳名・路線名・所在地・緯度経度を自動入力します（画像は選べないため、下のフォームで画像だけ追加してください）。
        </p>
      </div>

      <FacilityLedgerForm initialDocClass={initialDocClass} initial={initial} />
    </div>
  );
}
