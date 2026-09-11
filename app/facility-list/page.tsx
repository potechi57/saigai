import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteFacilityListItem } from "@/lib/actions/facility-list-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { formatFacilityType } from "@/lib/labels";

export const dynamic = "force-dynamic";

// 「施設一覧」形式のExcelから取り込んだ、道路土工構造物点検（法面構造物：切土・のり面・
// 盛土・擁壁・ブロック積等の健全性・安定性を対象とする点検。道路土工構造物点検要領）の
// 台帳一覧画面。橋梁・トンネル・シェッド・大型カルバート等は法定点検（別の定期点検要領）
// の対象であり、この一覧の対象外（台帳（画像）の登録／今後の別機能で扱う想定）。
// 防災カルテ（自然災害・斜面災害リスクの点検。落石・崩壊等が対象）の検索・一覧画面
// （/karte）とは別の、シンプルな全件テーブル表示にしている
// （件数規模が施設一覧＝台帳全体であり、カルテほど複雑な検索条件は
// 今のところ不要なため）。地図（/karte）にはピンとして表示される。
export default async function FacilityListPage() {
  const items = await prisma.facilityListItem.findMany({ orderBy: { managementNo: "asc" } });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Link href="/import" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 資料読み込みに戻る
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">施設一覧（{items.length}件）</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            道路土工構造物点検（法面構造物：切土・盛土・擁壁・ブロック積等）の台帳
          </p>
        </div>
        <Link
          href="/facility-list/import"
          className="rounded bg-gray-800 px-4 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          ＋ Excelから取り込む
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="rounded border border-gray-300 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
          まだ取り込まれた施設はありません。
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700 text-left text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-3 py-2">管理番号</th>
                <th className="px-3 py-2">管轄事務所</th>
                <th className="px-3 py-2">路線名</th>
                <th className="px-3 py-2">施設種別</th>
                <th className="px-3 py-2">所在地</th>
                <th className="px-3 py-2">健全度</th>
                <th className="px-3 py-2">点検実施日</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-3 py-2 text-gray-800 dark:text-gray-100">{it.managementNo}</td>
                  <td className="px-3 py-2">{it.officeName ?? "—"}</td>
                  <td className="px-3 py-2">{it.routeName ?? "—"}</td>
                  <td className="px-3 py-2">{formatFacilityType(it.facilityType, it.facilitySubType) ?? "—"}</td>
                  <td className="px-3 py-2">{it.location ?? "—"}</td>
                  <td className="px-3 py-2">{it.soundnessGrade ?? "—"}</td>
                  <td className="px-3 py-2">
                    {it.inspectionDate ? new Date(it.inspectionDate).toLocaleDateString("ja-JP") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <form action={deleteFacilityListItem.bind(null, it.id)}>
                      <ConfirmSubmitButton
                        message={`「${it.managementNo}」を削除しますか？（元に戻せません）`}
                        pendingLabel="削除中..."
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        削除
                      </ConfirmSubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
