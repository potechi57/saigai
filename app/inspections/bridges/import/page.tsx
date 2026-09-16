import Link from "next/link";
import BridgeInspectionImportForm from "@/components/BridgeInspectionImportForm";

export const dynamic = "force-dynamic";

// 橋梁定期点検調書Excelの取込画面（会話ログ「過去の門型標識点検のエクセル
// ファイルを参考に橋梁の点検様式の取り込みもできるようにしてほしい」参照）。
export default function BridgeInspectionImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Link href="/inspections/bridges" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 点検調書（橋梁）一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">点検調書（橋梁）の取込</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        「別紙２　様式１様式２」形式の橋梁定期点検調書Excelを取り込みます。Excel内の橋梁番号（管理番号）で、施設台帳（橋梁）の該当行と自動的に紐付きます。
      </p>
      <BridgeInspectionImportForm />
    </div>
  );
}
