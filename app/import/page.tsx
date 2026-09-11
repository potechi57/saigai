import Link from "next/link";

export const dynamic = "force-dynamic";

// 「資料読み込み」ハブ画面。データの追加方法（Excel取込・台帳画像登録・手入力）が
// 複数存在するため、ヘッダーに個別のリンクを並べるのではなく、まずこの画面へ
// 集約し、それぞれの手法をどんな時に使うのか説明付きで案内する
// （どの方法で取り込むべきか迷わないようにするため）。
const METHODS: {
  title: string;
  description: string;
  when: string;
  href: string;
  icon: string;
}[] = [
  {
    icon: "📋",
    title: "防災カルテExcelの取込",
    description:
      "様式Ａ〜Ｄ（点検地点位置図・詳細スケッチ・点検履歴・災害履歴）を含む、防災カルテ様式のExcelファイル（全国地質調査業協会連合会版）を取り込みます。写真も自動で取り込まれます。",
    when: "県土整備事務所から配布される、防災カルテ様式そのもののExcelファイルを受け取った場合。",
    href: "/karte/import",
  },
  {
    icon: "🛣️",
    title: "施設一覧Excelの取込",
    description:
      "Accessの施設管理データベースから出力されたと思われる、道路法面施設等の「施設一覧」形式のExcel（管理番号・路線名・所在地・緯度経度・直近点検の健全度等が一覧で並ぶ表）を取り込みます。管理番号ごとにDBへ登録し、地図にピンで表示します。",
    when: "「施設一覧」「◯◯台帳」といった、多数の施設が一覧表になったExcelを受け取った場合（防災カルテ様式そのものではないもの）。",
    href: "/facility-list/import",
  },
  {
    icon: "🚇",
    title: "台帳（画像）の登録",
    description:
      "トンネル台帳等、Excelのような構造化データが無く、スキャン画像でしか残っていない台帳を、画像1枚と最低限の基本情報（台帳名・路線名・所在地・緯度経度）だけで登録します。",
    when: "紙の台帳をスキャンした画像（PDF・JPG等）しか手元に無く、Excelデータが存在しない場合。",
    href: "/ledgers/new",
  },
  {
    icon: "✍️",
    title: "手入力で新規登録",
    description: "上記のいずれにも当てはまらない場合に、フォームから直接カルテを1件ずつ新規登録します。",
    when: "Excelも画像も無く、これから新しくカルテを作成する場合。",
    href: "/karte/new",
  },
];

export default function ImportHubPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 検索・一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">資料読み込み</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        受け取った資料の種類に応じて、以下から取込方法を選んでください。
      </p>

      <ul className="space-y-3">
        {METHODS.map((m) => (
          <li key={m.href} className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <Link href={m.href} className="block">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>
                  {m.icon}
                </span>
                <div className="flex-1">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100 hover:underline">{m.title}</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{m.description}</p>
                  <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <span className="font-medium text-gray-500 dark:text-gray-400">こんな時に:</span> {m.when}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 text-sm">
        <p className="font-medium text-gray-700 dark:text-gray-200">既に取り込んだ資料の確認</p>
        <div className="mt-2 flex flex-wrap gap-4">
          <Link href="/karte/import" className="text-blue-600 dark:text-blue-400 hover:underline">
            防災カルテの取込履歴を見る →
          </Link>
          <Link href="/facility-list" className="text-blue-600 dark:text-blue-400 hover:underline">
            施設一覧を見る →
          </Link>
          <Link href="/ledgers" className="text-blue-600 dark:text-blue-400 hover:underline">
            台帳（画像）一覧を見る →
          </Link>
        </div>
      </div>
    </div>
  );
}
