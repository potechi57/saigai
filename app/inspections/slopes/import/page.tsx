import SlopeStructureInspectionImportForm from "@/components/SlopeStructureInspectionImportForm";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// 法面構造物点検調書Excelの取込画面（app/inspections/bridges/import/page.tsxと同じ構成）。
export default function SlopeStructureInspectionImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <BackLink fallbackHref="/inspections/slopes">
        ← 点検調書（法面構造物）一覧に戻る
      </BackLink>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">点検調書（法面構造物）の取込</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        法面構造物の点検調書Excel（点検表＋点検チェックシート形式）を取り込みます。Excel内の箇所番号（管理番号）で、施設台帳（法面構造物）の該当行と自動的に紐付きます。
      </p>
      <SlopeStructureInspectionImportForm />
    </div>
  );
}
