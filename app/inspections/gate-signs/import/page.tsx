import GateSignInspectionImportForm from "@/components/GateSignInspectionImportForm";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// 門型標識点検調書Excelの取込画面（会話ログ参照）。
export default function GateSignInspectionImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <BackLink fallbackHref="/inspections/gate-signs">
        ← 点検調書（門型標識）一覧に戻る
      </BackLink>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">点検調書（門型標識）の取込</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        「別紙２　様式１様式２」形式の門型標識点検調書Excelを取り込みます。ファイル名の先頭の管理番号（例:「A01-AE-010474」）で、施設台帳（道路標識）の該当行と自動的に紐付きます。
      </p>
      <GateSignInspectionImportForm />
    </div>
  );
}
