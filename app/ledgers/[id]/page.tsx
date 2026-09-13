import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FACILITY_LEDGER_DOC_CLASS_LABEL, facilityLedgerDisplayName, formatFacilityType } from "@/lib/labels";
import { deleteFacilityLedger } from "@/lib/actions/facility-ledger-actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import FacilityLedgerImageManager from "@/components/FacilityLedgerImageManager";
import FacilityLedgerEditForm from "@/components/FacilityLedgerEditForm";

export const dynamic = "force-dynamic";

// 台帳（画像。FacilityLedger）1件の詳細画面。地図（/karte）のピンから
// ここへ飛べるようにしている（会話ログ「map上からこの施設専用のページに
// 飛べる仕様にできませんか」参照）。
//
// 1施設で複数枚の画像（調書・図面等）を持てるため、Excelのシート切替に見立てた
// タブ（components/SheetTabs.tsx。FacilityLedgerImageManager参照）で切り替えて
// 見せる。タブ名は登録後も自由に変更でき、画像の追加・削除もこの画面で行える。
// 管理番号が無い施設も多いため、表示名は管理番号があればそれを、無ければ台帳名を
// 使う（lib/labels.tsのfacilityLedgerDisplayName参照）。
export default async function FacilityLedgerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ledger = await prisma.facilityLedger.findUnique({
    where: { id },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  });
  if (!ledger) notFound();

  const displayName = facilityLedgerDisplayName(ledger.managementNo, ledger.name);
  const facilityTypeLabel = formatFacilityType(ledger.facilityType, ledger.facilitySubType);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <Link href="/ledgers" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 台帳一覧に戻る
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{displayName}</h1>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {FACILITY_LEDGER_DOC_CLASS_LABEL[ledger.docClass] ?? ledger.docClass}
        </span>
        {facilityTypeLabel && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {facilityTypeLabel}
          </span>
        )}
      </div>
      {ledger.managementNo && ledger.name && ledger.managementNo !== ledger.name && (
        <p className="text-sm text-gray-500 dark:text-gray-400">台帳名: {ledger.name}</p>
      )}

      <section className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-300 px-3 py-2 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">画像（{ledger.images.length}件）</h2>
        </div>
        <div className="p-3">
          <FacilityLedgerImageManager ledgerId={ledger.id} images={ledger.images} />
        </div>
      </section>

      <details className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          基本情報を編集
        </summary>
        <div className="border-t border-gray-300 p-4 dark:border-gray-700">
          <FacilityLedgerEditForm
            ledgerId={ledger.id}
            initial={{
              docClass: ledger.docClass,
              facilityType: ledger.facilityType ?? "",
              facilitySubType: ledger.facilitySubType ?? "",
              managementNo: ledger.managementNo ?? "",
              name: ledger.name ?? "",
              routeName: ledger.routeName ?? "",
              location: ledger.location ?? "",
              latitude: ledger.latitude != null ? String(ledger.latitude) : "",
              longitude: ledger.longitude != null ? String(ledger.longitude) : "",
              note: ledger.note ?? "",
            }}
          />
        </div>
      </details>

      <form action={deleteFacilityLedger.bind(null, ledger.id)}>
        <ConfirmSubmitButton
          message={`「${displayName}」を削除しますか？（登録済みの画像も全て削除され、元に戻せません）`}
          pendingLabel="削除中..."
          className="text-sm text-red-600 hover:underline dark:text-red-400"
        >
          この台帳を削除
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}
