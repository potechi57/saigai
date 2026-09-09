import Link from "next/link";
import ExcelImportForm from "@/components/ExcelImportForm";

export const dynamic = "force-dynamic";

// Excel取込画面（指示書17章「データ取り込み」）。
// 防災カルテ様式（全国地質調査業協会連合会版）のExcel（暗号化保護されている場合も含む）
// から、様式Ａ・様式Ｃの内容を読み取ってカルテを新規登録／更新する。
export default function ImportKartePage() {
  return (
    <div className="space-y-4">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 検索・一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Excelから取り込む</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        防災カルテ様式のExcelファイル（様式Ａ・様式Ｃを含むxls/xlsx）をアップロードすると、
        基本情報と点検履歴を読み取ってカルテを登録します。同じ施設管理番号のカルテが既にある場合は、
        内容を上書き更新します（点検記録は点検日単位で重複登録されません）。
      </p>
      <ExcelImportForm />
      <div className="rounded border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-3 text-xs text-yellow-800 dark:text-yellow-300">
        <p className="font-semibold">現時点の制限</p>
        <ul className="mt-1 list-disc pl-4">
          <li>様式Ｂ（点検対象の名称・変状の内容）は未対応です。取込後、点検対象の編集画面から実際の名称に修正してください。</li>
          <li>着目すべき変状が複数ある場合の使い分け、8回以上の点検履歴（シート複製）、様式Ｄ（災害履歴）は未対応です。</li>
          <li>所在地（郡・町名）、道路種別は、実データでの位置確認が取れていないため取り込み対象外です。</li>
        </ul>
      </div>
    </div>
  );
}
