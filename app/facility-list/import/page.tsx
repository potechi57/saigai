import Link from "next/link";
import FacilityListImportForm from "@/components/FacilityListImportForm";

export const dynamic = "force-dynamic";

// 「施設一覧」形式のExcel（道路施設の管理台帳の出力）を取り込む画面。
// 防災カルテのExcel取込（/karte/import）とは別の画面にしている
// （形式も目的も別のデータのため）。
export default function FacilityListImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Link href="/import" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 資料読み込みに戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">施設一覧Excelから取り込む</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        島根県の点検業務で貸与される「施設一覧」形式のExcel（管理番号・路線名・所在地・緯度経度・直近点検の健全度等が一覧で並ぶ表）を取り込みます。管理番号ごとにDBへ登録し、緯度経度が入っている行は地図（検索・一覧画面）にもピンで表示されます。同じ管理番号の行は、再度取り込むと内容が上書き更新されます。
      </p>
      <FacilityListImportForm />
      <div className="rounded border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-3 text-xs text-yellow-800 dark:text-yellow-300">
        <p className="font-semibold">現時点の制限</p>
        <ul className="mt-1 list-disc pl-4">
          <li>「施設一覧」形式として確認済みの列位置（管理番号・施設分野・路線名・所在地・緯度経度・健全度・点検実施日等）を前提にしています。想定の列位置に無いレイアウトのファイルは正しく取り込めません。</li>
          <li>防災カルテ（様式Ａ〜Ｄ）のような詳細記録ではなく、施設の基本情報と直近点検の要約（健全度・点検日・所見）だけを保持する軽量なデータです。写真の取込には対応していません。</li>
        </ul>
      </div>
    </div>
  );
}
