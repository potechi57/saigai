import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatFacilityType } from "@/lib/labels";
import FacilityLedgerForm from "@/components/FacilityLedgerForm";

export const dynamic = "force-dynamic";

// 台帳（画像）の登録画面。読み込み実務ではおそらく、先に施設台帳（一覧表）で
// 対象施設を登録しておき、その後に台帳画像を貼り付ける、という順序になる
// との指摘を受け、施設台帳から対象を選ぶと、台帳名・路線名・所在地・緯度経度を
// 自動入力できるようにしている（会話ログ参照）。選択は必須ではなく、
// 施設台帳に無い対象は従来通り手入力できる。
// FacilityLedgerとFacilityListItemの間にDB上の関連は持たせていない
// （現状はあくまで新規登録時の入力補助。将来的に紐付けが必要になった場合は
// 別途検討する）。
export default async function NewFacilityLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ facilityId?: string; docClass?: string }>;
}) {
  const { facilityId, docClass } = await searchParams;
  // 資料読み込みハブ（/import?method=image&cat=ledger|facility）から来た場合、
  // どちらの分類で画像登録しようとしていたかをフォームの初期選択に反映する
  // （app/import/page.tsx参照）。直接このURLを開いた場合は施設台帳を既定にする。
  const initialDocClass: "LEGAL" | "FACILITY" = docClass === "LEGAL" ? "LEGAL" : "FACILITY";

  // 選択肢が多くなりすぎないよう、直近の一定件数のみ候補にする
  // （検索欄は無く単純な<select>のため。件数が増えてきたら絞り込みUIを検討する）。
  const facilityCandidates = await prisma.facilityListItem.findMany({
    orderBy: { managementNo: "asc" },
    take: 200,
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
  });

  const selected = facilityId ? facilityCandidates.find((f) => f.id === facilityId) : undefined;
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

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Link href="/ledgers" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 台帳一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">台帳（画像）を登録</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Excelのような構造化データが無く、スキャン画像でしか残っていない台帳（トンネル台帳等）を登録します。緯度経度を入力すると、地図（検索・一覧画面）にもピンで表示されます。
      </p>

      {facilityCandidates.length > 0 && (
        <form
          method="GET"
          className="rounded border border-gray-300 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
            施設台帳から選んで自動入力（任意）
          </label>
          {docClass && <input type="hidden" name="docClass" value={docClass} />}
          <div className="flex gap-2">
            <select
              name="facilityId"
              defaultValue={facilityId ?? ""}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">選択してください</option>
              {facilityCandidates.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.managementNo}
                  {formatFacilityType(f.facilityType, f.facilitySubType)
                    ? `（${formatFacilityType(f.facilityType, f.facilitySubType)}）`
                    : ""}
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
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            先に「一覧表」で施設台帳へ登録済みの施設を選ぶと、台帳名・路線名・所在地・緯度経度を自動入力します（画像は選べないため、下のフォームで画像だけ追加してください）。
          </p>
        </form>
      )}

      <FacilityLedgerForm initialDocClass={initialDocClass} initial={initial} />
    </div>
  );
}
