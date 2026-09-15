import Link from "next/link";
import Form from "next/form";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

// スマホ側の簡易ビュー（現場確認用）。PC側（/karte以下）のような検索条件・地図・
// 様式再現等のリッチな機能は持たせず、「施設管理番号で検索→その場で撮った写真を
// 確認する」という最小限の用途に絞っている（ユーザー要望「カルテデータの写真を
// 表示できればよい。PC版のようなリッチな機能は不要」に対応）。
// 認証機能はこのMVP全体に無いため、ここでも追加していない（PC側と同じ開放範囲）。
export default async function MobileHomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  // スマホのソフトキーボード・自動補完で前後に空白が混じりやすいため、
  // 検索前にトリムする（末尾の全角/半角スペースが残ると、実在する施設番号でも
  // 「見つかりませんでした」になってしまうため）。
  const trimmedQ = q?.trim();
  // 現場では「施設管理番号を正確に覚えていない」ことも多いため、施設管理番号だけで
  // なく、路線名・位置目印・所在地（郡市〜町村／大字等）のいずれかに部分一致すれば
  // ヒットする単一の検索欄にしている（会話ログ「路線から検索できるように」より）。
  // PC側（/karte）は分野横断の多条件フォームだが、/mは片手操作を優先し、
  // 項目を分けず1つの入力欄でOR検索する方針にした。
  //
  // 所在地はlocationDistrict（郡・市〜町村）とlocationTown（大字等）の2カラムに
  // 分かれているため、検索語がどちらか一方に収まっていればここで拾えるが、
  // 2カラムの境界をまたぐ語（例: districtの末尾〜townの先頭にまたがる地名の一部）は
  // 拾えない（/karteのJS側フィルタと同様の制限。詳細検索が必要な場合はPC版を案内する）。
  const kartes = trimmedQ
    ? await prisma.karte.findMany({
        where: {
          OR: [
            { facilityNo: { contains: trimmedQ, mode: "insensitive" } },
            { routeName: { contains: trimmedQ, mode: "insensitive" } },
            { landmark: { contains: trimmedQ, mode: "insensitive" } },
            { locationDistrict: { contains: trimmedQ, mode: "insensitive" } },
            { locationTown: { contains: trimmedQ, mode: "insensitive" } },
          ],
        },
        orderBy: { facilityNo: "asc" },
        take: 30,
        select: { facilityNo: true, karteType: true, routeName: true, locationDistrict: true, locationTown: true },
      })
    : [];

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">現場確認（写真）</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        施設管理番号・路線名・所在地のいずれかの一部を入力して検索してください。
      </p>
      <Form action="" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="例: SAMPLE-0001 / 国道9号 / 松江市"
          className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <button
          type="submit"
          className="rounded bg-gray-800 px-4 py-2 text-sm text-white dark:bg-gray-700"
        >
          検索
        </button>
      </Form>

      {trimmedQ && (
        <ul className="space-y-2">
          {/* take:30で打ち切っているため、路線名等で広くヒットする検索語だと
              全件ではない可能性がある。気づかず「これで全部」と誤解しないよう明示する。 */}
          {kartes.length === 30 && (
            <li className="rounded border border-yellow-300 bg-yellow-50 p-2 text-center text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
              先頭30件のみ表示しています。絞り込めない場合は、より詳しい語句（施設管理番号等）で再検索してください。
            </li>
          )}
          {kartes.map((k) => (
            <li key={k.facilityNo}>
              <Link
                href={`/m/${k.facilityNo}`}
                className="block rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
              >
                <p className="font-semibold text-gray-800 dark:text-gray-100">{k.facilityNo}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {KARTE_TYPE_LABEL[k.karteType] ?? k.karteType} ・ {k.routeName}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {[k.locationDistrict, k.locationTown].filter(Boolean).join(" ")}
                </p>
              </Link>
            </li>
          ))}
          {kartes.length === 0 && (
            <li className="rounded border border-gray-300 bg-white p-4 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
              該当するカルテが見つかりませんでした。
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
