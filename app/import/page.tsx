import Link from "next/link";

export const dynamic = "force-dynamic";

// 「資料読み込み」ハブ画面。データの追加方法（Excel取込・台帳画像登録・手入力）が
// 複数存在するため、ヘッダーに個別のリンクを並べるのではなく、まずこの画面へ
// 集約し、それぞれの手法をどんな時に使うのか説明付きで案内する
// （どの方法で取り込むべきか迷わないようにするため）。
//
// 分類は、検索・地図画面（app/karte/page.tsx）と同じ「法令台帳」「施設台帳」
// 「点検調書」の3分類に揃えている（会話ログ参照。島根県公共土木施設台帳の分類:
// https://www.pref.shimane.lg.jp/infra/kouji/kouji_info/rokyuka/manual.html）。
// 3分類はそれぞれ独立しており、同じ「道路」等の名前が出てきても中身は別物として
// 扱う（app/karte/page.tsxのコメント参照）。
//   1. 法令台帳：現状、トンネルの画像台帳（FacilityLedger）のみ対応。Excelのような
//      構造化データが無く、スキャン画像でしか残っていない台帳を登録する。
//   2. 施設台帳：法面構造物、道路標識等の道路附属物、橋梁、トンネル等、道路施設
//      全般の管理データ（FacilityListItem）。「施設一覧」形式のExcelは、法面・
//      道路標識・橋梁等どの施設種別でも列構成が同じ1つのフォーマットであることを
//      実データ（施設一覧(道路法面施設).xlsx・門型標識の施設一覧.xlsx）で確認済み
//      のため、施設種別ごとに取込方法を分けていない（施設種別・施設細別はデータの
//      中の列であり、取込窓口を分ける理由にはならない。なお道路土工構造物点検・
//      法定点検等、施設種別ごとに異なる点検制度が存在する点はlib/labels.tsの
//      formatFacilityType()コメント等を参照）。
//   3. 点検調書：現状、「災害」分野（防災カルテ点検。落石・崩壊、盛土、擁壁、
//      橋梁基礎の洗掘、地吹雪等が対象。岩盤崩壊・地すべり・雪崩・土石流は、
//      島根県での運用実態に合わせKarteType自体から除いた。
//      prisma/schema.prismaのKarteTypeコメント参照）のみ対応。
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
    title: "法令台帳",
    scope: "道路法施行規則に基づく法定点検の対象施設等の台帳です。現状はトンネルの画像台帳のみ対応しています。",
    methods: [
      {
        title: "台帳（画像）の登録",
        description:
          "トンネル台帳等、Excelのような構造化データが無く、スキャン画像でしか残っていない台帳を、画像1枚と最低限の基本情報（台帳名・路線名・所在地・緯度経度）だけで登録します。現状はトンネルのみ対応しています。",
        example: "紙の台帳をスキャンした画像（PDF・JPG等）しか手元に無く、Excelデータが存在しない場合。",
        href: "/ledgers/new",
      },
    ],
  },
  {
    title: "施設台帳",
    scope:
      "法面構造物、道路標識等の道路附属物、橋梁、トンネル等、道路施設全般の管理データです。施設ごとの点検制度（道路土工構造物点検要領・法定点検等）はデータの中の「施設種別」で区別され、取込方法（窓口）自体は施設種別を問いません。",
    methods: [
      {
        title: "一覧読み込み",
        description:
          "管理番号・路線名・所在地・緯度経度・直近点検の健全度等が一覧で並ぶ「施設一覧」形式のExcelを取り込みます。法面構造物・道路標識・橋梁等、施設種別は問いません。管理番号ごとにDBへ登録し、地図にピンで表示します。",
        example: "「施設一覧」「◯◯台帳」といった、多数の施設が一覧表になったExcelを受け取った場合（防災カルテ様式そのものではないもの）。",
        href: "/facility-list/import",
      },
    ],
  },
  {
    title: "点検調書",
    scope:
      "自然災害・斜面災害のリスクを対象とする「災害」分野（防災カルテ点検）が現状唯一対応している分野です。落石・崩壊、盛土、擁壁、橋梁基礎の洗掘、地吹雪等が対象です。橋梁等その他分野の点検調書は今後追加予定です。",
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
          受け取った資料の種類に応じて、以下から取込方法を選んでください。検索・地図画面と同じ
          「法令台帳」「施設台帳」「点検調書」の3分類に分かれます（島根県公共土木施設台帳の分類に
          準拠）。迷った場合は資料の様式（防災カルテ様式か、施設一覧形式か、画像のみの台帳か等）を
          目安に選んでください。
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
          <Link href="/ledgers" className="text-blue-600 dark:text-blue-400 hover:underline">
            法令台帳（画像）一覧を見る →
          </Link>
          <Link href="/facility-list" className="text-blue-600 dark:text-blue-400 hover:underline">
            施設台帳を見る →
          </Link>
          <Link href="/karte/import" className="text-blue-600 dark:text-blue-400 hover:underline">
            点検調書（災害）の取込履歴を見る →
          </Link>
        </div>
      </div>
    </div>
  );
}
