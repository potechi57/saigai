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
  const kartes = trimmedQ
    ? await prisma.karte.findMany({
        where: { facilityNo: { contains: trimmedQ, mode: "insensitive" } },
        orderBy: { facilityNo: "asc" },
        take: 30,
        select: { facilityNo: true, karteType: true, routeName: true, locationDistrict: true, locationTown: true },
      })
    : [];

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">現場確認（写真）</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        施設管理番号の一部を入力して検索してください。
      </p>
      <Form action="" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="例: SAMPLE-0001"
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
