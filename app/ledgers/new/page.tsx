import Link from "next/link";
import FacilityLedgerForm from "@/components/FacilityLedgerForm";

export const dynamic = "force-dynamic";

export default function NewFacilityLedgerPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Link href="/ledgers" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 台帳一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">台帳（画像）を登録</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Excelのような構造化データが無く、スキャン画像でしか残っていない台帳（トンネル台帳等）を登録します。緯度経度を入力すると、地図（検索・一覧画面）にもピンで表示されます。
      </p>
      <FacilityLedgerForm />
    </div>
  );
}
