import Link from "next/link";
import ExcelImportForm from "@/components/ExcelImportForm";

export const dynamic = "force-dynamic";

// Excel取込画面（指示書17章「データ取り込み」）。
// 防災カルテ様式（全国地質調査業協会連合会版）のExcel（暗号化保護されている場合も含む）
// から、様式Ａ（基本情報）・様式Ｂ（点検対象ごとの詳細記録）・様式Ｃ（点検履歴）の内容と、
// 様式Ａ・様式Ｂ・「現状記録写真」シートの写真を読み取ってカルテを新規登録／更新する。
// 様式Ｄ（災害履歴）はカルテ詳細画面での表示のみ対応しており、Excelからの取込は未対応
// （下記「現時点の制限」参照）。
export default function ImportKartePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 検索・一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Excelから取り込む</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        防災カルテ様式のExcelファイル（様式Ａ・様式Ｂ・様式Ｃを含むxls/xlsx）をアップロードすると、
        基本情報・点検対象ごとの詳細記録・点検履歴・写真を読み取ってカルテを登録します。
        同じ施設管理番号のカルテが既にある場合は、内容を上書き更新します
        （点検記録は点検日単位で重複登録されません）。
      </p>
      <ExcelImportForm />
      <div className="rounded border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-3 text-xs text-yellow-800 dark:text-yellow-300">
        <p className="font-semibold">現時点の制限</p>
        <ul className="mt-1 list-disc pl-4">
          <li>様式Ｂ（点検対象ごとの詳細記録）は、シート数に応じて点検対象を自動作成し、着目すべき点・チェック項目・写真（詳細スケッチ欄2枚＋写真張付欄1枚）を取り込みます。対象名称は様式Ｂに記入欄が無いため「点検対象N（Excel取込・要確認）」という仮の名称になります。取込後に編集画面から実際の名称に修正してください。</li>
          <li>様式Ｄ（災害履歴）は、カルテ詳細画面には実際のExcelレイアウトで表示されますが、Excelからの自動取込にはまだ対応していません（既存データの閲覧専用で、被災・対策実績が無いカルテでも空欄のまま様式のレイアウトを表示します）。新規登録・編集用の画面もまだありません。</li>
          <li>8回以上の点検履歴（シート複製）は未対応です。</li>
          <li>規制基準等（連続雨量・時間雨量）・交通量のセンサス調査年度／観測地点番号は、記入済みの実データで位置を確認できたため、Excelからの自動取込に対応しました。ただし規制基準等・交通量関連の項目（規制基準等・交通量・センサス・ＤＩＤ区間・バス路線・迂回路・緊急輸送道路区分）は、Excel取込専用の項目としており、カルテ編集画面からの手動入力にはまだ対応していません。</li>
          <li>「着目すべき変状」は様式内に2箇所（専門技術者による点検欄の下の一言／点検の時期等と並ぶ表の中）ありますが、内容が異なる場合は前者のみを取り込みます。</li>
          <li>点検の時期は「定期」の場合のみ対応しています（「不定期」側の実データが確認できていません）。</li>
          <li>様式Ａ・様式Ｂの写真、および「現状記録写真」（「R7現状記録写真」等の別シート。複数枚ある場合の連番シートも含む）の写真は、各写真に添えられたキャプション文字列（「起点側全景」等）とあわせて自動で取り込みます。</li>
          <li>
            スケッチ等のEMF/WMF形式（ベクター画像）は、EMF変換サービス（自前で管理するGoogle
            Cloud Run上でLibreOffice
            headlessを動かす小さなサーバー。詳しくは`services/emf-converter/README.md`参照）の環境変数を設定した場合のみPNGに変換して取り込みます。未設定の環境では従来どおり対象外です。変換処理は自分たちが管理するインフラ内で完結し、外部の第三者クラウドサービスへデータを送信することはありません。
          </li>
        </ul>
      </div>
    </div>
  );
}
