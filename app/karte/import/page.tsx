import Link from "next/link";
import ExcelImportForm from "@/components/ExcelImportForm";
import BulkExcelImportForm from "@/components/BulkExcelImportForm";
import { prisma } from "@/lib/prisma";
import { formatJstDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const IMPORT_HISTORY_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  IN_PROGRESS: { label: "処理中", className: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" },
  SUCCESS: { label: "成功", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  FAILURE: { label: "失敗", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

// Excel取込画面（指示書17章「データ取り込み」）。
// 防災カルテ様式（全国地質調査業協会連合会版）のExcel（暗号化保護されている場合も含む）
// から、様式Ａ（基本情報）・様式Ｂ（点検対象ごとの詳細記録）・様式Ｃ（点検履歴）の内容と、
// 様式Ａ・様式Ｂ・「現状記録写真」シートの写真を読み取ってカルテを新規登録／更新する。
// 様式Ｄ（災害履歴）はカルテ詳細画面での表示のみ対応しており、Excelからの取込は未対応
// （下記「現時点の制限」参照）。
export default async function ImportKartePage() {
  // 直近の取込履歴（項目4「Excel取り込み履歴を表示する」）。DBに保存しているため、
  // 端末・ブラウザを問わず、事務所内の誰が取り込んだ履歴も共有で確認できる
  // （lib/actions/import-actions.tsのcreateImportHistory等参照）。
  const history = await prisma.importHistory.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href="/import" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 資料読み込みに戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Excelから取り込む</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        防災カルテ様式のExcelファイル（様式Ａ・様式Ｂ・様式Ｃを含むxls/xlsx）をアップロードすると、
        基本情報・点検対象ごとの詳細記録・点検履歴・写真を読み取ってカルテを登録します。
        同じ施設管理番号のカルテが既にある場合は、内容を上書き更新します
        （点検記録は点検日単位で重複登録されません）。
      </p>
      <ExcelImportForm />

      <BulkExcelImportForm />

      <div className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-300 px-3 py-2 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">取込履歴（直近10件）</h2>
        </div>
        {history.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 dark:text-gray-500">まだ取込履歴はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">取込日時</th>
                  <th className="px-3 py-2">ファイル名</th>
                  <th className="px-3 py-2">結果</th>
                  <th className="px-3 py-2">施設管理番号</th>
                  <th className="px-3 py-2">点検対象</th>
                  <th className="px-3 py-2">点検記録</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const status = IMPORT_HISTORY_STATUS_LABEL[h.status] ?? IMPORT_HISTORY_STATUS_LABEL.IN_PROGRESS;
                  return (
                    <tr key={h.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                        {formatJstDateTime(h.startedAt)}
                      </td>
                      <td className="max-w-[16rem] truncate px-3 py-2 text-gray-800 dark:text-gray-100" title={h.fileName}>
                        {h.fileName}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
                        {h.status === "FAILURE" && h.errorMessage && (
                          <p className="mt-0.5 max-w-[20rem] truncate text-xs text-red-500 dark:text-red-400" title={h.errorMessage}>
                            {h.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {h.facilityNo ? (
                          <Link href={`/karte/${h.facilityNo}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {h.facilityNo}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{h.targetCount ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{h.eventCount ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-3 text-xs text-yellow-800 dark:text-yellow-300">
        <p className="font-semibold">現時点の制限</p>
        <ul className="mt-1 list-disc pl-4">
          <li>
            様式Ａ・様式Ｂの「点検地点位置図」「詳細スケッチ欄」は、EMF/WMFスケッチに重なる注記・図形・矢印等も
            含めて欠落なく取り込むため、セル範囲ごと1枚の画像として取り込みます。その右側の「現況写真」
            「写真張付欄」は、埋め込まれている枚数分だけ個別の写真として取り込みます（枚数は固定ではありません）。
          </li>
          <li>様式Ｂ（点検対象ごとの詳細記録）は、シート数に応じて点検対象を自動作成し、着目すべき点・チェック項目も併せて取り込みます。対象名称は様式Ｂに記入欄が無いため「点検対象N（Excel取込・要確認）」という仮の名称になります。取込後に編集画面から実際の名称に修正してください。</li>
          <li>様式Ｄ（災害履歴）は、カルテ詳細画面には実際のExcelレイアウトで表示されますが、Excelからの自動取込にはまだ対応していません（既存データの閲覧専用で、被災・対策実績が無いカルテでも空欄のまま様式のレイアウトを表示します）。新規登録・編集用の画面もまだありません。</li>
          <li>8回以上の点検履歴（シート複製）は未対応です。</li>
          <li>規制基準等（連続雨量・時間雨量）・交通量のセンサス調査年度／観測地点番号は、記入済みの実データで位置を確認できたため、Excelからの自動取込に対応しました。ただし規制基準等・交通量関連の項目（規制基準等・交通量・センサス・ＤＩＤ区間・バス路線・迂回路・緊急輸送道路区分）は、Excel取込専用の項目としており、カルテ編集画面からの手動入力にはまだ対応していません。</li>
          <li>「着目すべき変状」は様式内に2箇所（専門技術者による点検欄の下の一言／点検の時期等と並ぶ表の中）ありますが、内容が異なる場合は前者のみを取り込みます。</li>
          <li>点検の時期は「定期」の場合のみ対応しています（「不定期」側の実データが確認できていません）。</li>
          <li>
            「現状記録写真」（「R7現状記録写真」等の別シート。複数枚ある場合の連番シートも含む）の写真は、各写真に
            添えられたキャプション文字列（「起点側全景」等）とあわせて自動で取り込みます（様式Ａ・様式Ｂの写真には
            キャプションの対応付けはありません）。
          </li>
          <li>
            様式Ａ・様式Ｂの画像化には、自前で管理するGoogle Cloud Run上でLibreOffice
            headlessを動かす小さなサーバー（EMF変換サービス。詳しくは`services/emf-converter/README.md`参照）を
            使います。出力形式はPNG・JPEGのうちファイルサイズが小さい方を自動で選びます（本番環境では設定済み）。
            この変換サービスの環境変数（`EMF_CONVERTER_URL`等）が未設定のローカル開発環境等では、様式Ａ・様式Ｂの
            画像化や、現状記録写真シートのEMF/WMF形式の写真は取り込まれずスキップされます。変換処理は自分たちが
            管理するインフラ内で完結し、外部の第三者クラウドサービスへデータを送信することはありません。
          </li>
          <li>
            「まとめて取り込む」は、選択した順に1件ずつ処理します（同時並行では処理しません）。処理中にタブを
            閉じると、それ以降の未処理のファイルは取り込まれません。完了まで開いたままにしてください。
          </li>
        </ul>
      </div>
    </div>
  );
}
