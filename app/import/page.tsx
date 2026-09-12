import Link from "next/link";

export const dynamic = "force-dynamic";

// 「資料読み込み」ハブ画面。データの追加方法（Excel取込・台帳画像登録・手入力）が
// 複数存在するため、ヘッダーに個別のリンクを並べるのではなく、まずこの画面へ
// 集約し、それぞれの手法をどんな時に使うのか説明付きで案内する
// （どの方法で取り込むべきか迷わないようにするため）。
//
// 点検・台帳の対象は、大きく2系統に分かれる（下記GROUPS参照）。
//   1. 防災カルテ点検（自然災害・斜面災害リスクの点検）：落石・崩壊、岩盤崩壊、地すべり、
//      雪崩、土石流、盛土、擁壁、橋梁基礎の洗掘、地吹雪等を対象とする、防災カルテ様式
//      特有のExcel（様式Ａ〜Ｄ）。防災カルテExcelの取込・手入力がこちらに該当する。
//   2. 施設一覧・台帳：法面構造物、门型標識等の道路附属物、橋梁、トンネル等、道路施設
//      全般の管理データ。「施設一覧」形式のExcelは、法面・门型標識・橋梁等どの施設種別
//      でも列構成が同じ1つのフォーマットであることを実データ（施設一覧(道路法面施設).xlsx・
//      門型標識の施設一覧.xlsx）で確認済みのため、施設種別ごとに取込方法を分けていない
//      （施設種別・施設細別はデータの中の列であり、取込窓口を分ける理由にはならない。
//      なお道路土工構造物点検・法定点検等、施設種別ごとに異なる点検制度が存在する点は
//      lib/labels.tsのformatFacilityType()コメント等を参照）。Excelの無い台帳（画像のみ、
//      現状トンネルのみ対応）は別途「台帳（画像）の登録」で扱う。
type Method = {
  title: string;
  description: string;
  example: string;
  href: string;
};

const GROUPS: {
  title: string;
  scope: string;
  methods: Method[];
}[] = [
  {
    title: "防災カルテ点検",
    scope:
      "自然災害・斜面災害のリスクを対象とする点検です。落石・崩壊、岩盤崩壊、地すべり、雪崩、土石流、盛土、擁壁、橋梁基礎の洗掘、地吹雪等が対象です。",
    methods: [
      {
        title: "防災カルテExcelの取込",
        description:
          "様式Ａ〜Ｄ（点検地点位置図・詳細スケッチ・点検履歴・災害履歴）を含む、防災カルテ様式のExcelファイル（全国地質調査業協会連合会版）を取り込みます。写真も自動で取り込まれます。",
        example: "県土整備事務所から配布される、防災カルテ様式そのもののExcelファイルを受け取った場合。",
        href: "/karte/import",
      },
      {
        title: "手入力で新規登録",
        description: "Excelも画像も無い場合に、フォームから直接カルテを1件ずつ新規登録します。",
        example: "これから新しく防災カルテを作成する場合。",
        href: "/karte/new",
      },
    ],
  },
  {
    title: "施設一覧・台帳",
    scope:
      "法面構造物、门型標識等の道路附属物、橋梁、トンネル等、道路施設全般の管理データです。施設ごとの点検制度（道路土工構造物点検要領・法定点検等）はデータの中の「施設種別」で区別され、取込方法（窓口）自体は施設種別を問いません。",
    methods: [
      {
        title: "一覧読み込み",
        description:
          "管理番号・路線名・所在地・緯度経度・直近点検の健全度等が一覧で並ぶ「施設一覧」形式のExcelを取り込みます。法面構造物・门型標識・橋梁等、施設種別は問いません。管理番号ごとにDBへ登録し、地図にピンで表示します。",
        example: "「施設一覧」「◯◯台帳」といった、多数の施設が一覧表になったExcelを受け取った場合（防災カルテ様式そのものではないもの）。",
        href: "/facility-list/import",
      },
      {
        title: "台帳（画像）の登録",
        description:
          "トンネル台帳等、Excelのような構造化データが無く、スキャン画像でしか残っていない台帳を、画像1枚と最低限の基本情報（台帳名・路線名・所在地・緯度経度）だけで登録します。現状はトンネルのみ対応しています。",
        example: "紙の台帳をスキャンした画像（PDF・JPG等）しか手元に無く、Excelデータが存在しない場合。",
        href: "/ledgers/new",
      },
    ],
  },
];

export default function ImportHubPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 検索・一覧に戻る
      </Link>
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">資料読み込み</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          受け取った資料の種類に応じて、以下から取込方法を選んでください。点検の対象は、大きく
          「防災カルテ点検」（自然災害・斜面災害リスク）と「施設一覧・台帳」（法面構造物・
          门型標識・橋梁・トンネル等、道路施設全般）の2系統に分かれます。盛土・擁壁のように
          複数の系統にまたがる対象もあるため、迷った場合は資料の様式（防災カルテ様式か、
          施設一覧形式か等）を目安に選んでください。
        </p>
      </div>

      {GROUPS.map((group, groupIndex) => (
        <div key={group.title} className="space-y-2">
          <div className="border-b border-gray-300 pb-1.5 dark:border-gray-700">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">
              {groupIndex + 1}. {group.title}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{group.scope}</p>
          </div>
          <ul className="space-y-2">
            {group.methods.map((m) => (
              <li key={m.href} className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
                <Link
                  href={m.href}
                  className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{m.title}</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{m.description}</p>
                  <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <span className="font-medium text-gray-500 dark:text-gray-400">対象例：</span>
                    {m.example}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}

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
