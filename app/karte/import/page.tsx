import Link from "next/link";
import ExcelImportForm from "@/components/ExcelImportForm";

export const dynamic = "force-dynamic";

// Excel取込画面（指示書17章「データ取り込み」）。
// 防災カルテ様式（全国地質調査業協会連合会版）のExcel（暗号化保護されている場合も含む）
// から、様式Ａ・様式Ｃの内容を読み取ってカルテを新規登録／更新する。
export default function ImportKartePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
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
          <li>様式Ｂ（点検対象の名称）は未対応です。取込時は「点検対象1（Excel取込・要確認）」というプレースホルダを自動作成するので、取込後に編集画面から実際の名称に修正してください。</li>
          <li>着目すべき変状が複数ある場合の使い分け、8回以上の点検履歴（シート複製）、様式Ｄ（災害履歴）は未対応です。</li>
          <li>規制基準等（連続雨量・時間雨量）は、値セルの位置が実データで確認できていないため未対応です。</li>
          <li>「着目すべき変状」は様式内に2箇所（専門技術者による点検欄の下の一言／点検の時期等と並ぶ表の中）ありますが、内容が異なる場合は前者のみを取り込みます。</li>
          <li>点検の時期は「定期」の場合のみ対応しています（「不定期」側の実データが確認できていません）。</li>
          <li>Excel内に埋め込まれた写真・画像の自動取込は未対応です。カルテ・点検対象の編集画面から別途アップロードしてください。</li>
        </ul>
      </div>
    </div>
  );
}
