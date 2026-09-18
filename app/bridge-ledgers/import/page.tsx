import BridgeLedgerImportForm from "@/components/BridgeLedgerImportForm";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// 橋梁台帳Excelの取込画面（会話ログ参照）。
export default function BridgeLedgerImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <BackLink fallbackHref="/bridge-ledgers">
        ← 橋梁台帳一覧に戻る
      </BackLink>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">橋梁台帳の取込</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        橋梁台帳Excel（橋梁調書・橋梁台帳・画像・付属図の4シート構成）を取り込みます。Excel内の管理番号（例:「P72-AB-911702」）で、施設台帳（橋梁）の該当行と自動的に紐付きます。
      </p>
      <BridgeLedgerImportForm />
    </div>
  );
}
