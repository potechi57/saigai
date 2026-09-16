import Link from "next/link";

export const dynamic = "force-dynamic";

// 「資料読み込み」ハブ画面。データの追加方法（画像読み込み・一覧表・エクセル読み込み）が
// 複数存在するため、ヘッダーに個別のリンクを並べるのではなく、まずこの画面へ
// 集約し、それぞれの手法をどんな時に使うのか説明付きで案内する
// （どの方法で取り込むべきか迷わないようにするため）。
//
// 【画面構成：方法→分類の2段階（＋エクセル読み込みのみ3段階）】
// 当初、「法令台帳・施設台帳・点検調書」という分類を先に選ぶ構成にしたが、
// 法令台帳・施設台帳・点検調書のいずれにも、画像読み込み・一覧表・エクセル読み込みの
// 3つの取込方法が将来的に必要になるとの指摘を受け、方法を先に選び、その後で
// どの分類の資料かを選ぶ構成に変更した（会話ログ参照）。
//   1. 画像読み込み：Excelのような構造化データが無く、スキャン画像でしか残って
//      いない資料を、画像1枚＋最低限の基本情報で登録する（FacilityLedger。
//      法令台帳・施設台帳のどちらでも使える共通の仕組み。分野・施設名称は
//      lib/facility-taxonomy.tsの分類から任意に選べる。以前は法令台帳＝
//      トンネル台帳と誤って対応付けていたが、トンネル台帳は実際には施設台帳に
//      属するとの指摘を受け訂正した。会話ログ参照）。
//   2. 一覧表：1つのExcelに多数の資料が一覧で並ぶ形式を、まとめて取り込む
//      （現状は施設台帳＝「施設一覧」形式のみ実装）。
//   3. エクセル読み込み：1件の資料について、様式に沿った詳細な項目を持つ
//      専用Excelを取り込む（点検調書＞防災＝防災カルテ様式、点検調書＞道路＞
//      門型標識・橋梁＝各定期点検調書様式、施設台帳＞橋梁台帳が実装済み）。
//      点検調書は将来的にも様式（分野）ごとに取込欄を分ける必要があるため、
//      分類を選んだ後にもう1段、様式（分野）を選ぶ構成にしている。
// 実装が無い組み合わせ（例: 一覧表×法令台帳）は「準備中」と案内するのみ
// （ユーザー指示: 「とりあえずは、表示画面のみで内容はなくて構いません」の
// 方針を踏襲）。
type MethodKey = "image" | "list" | "excel";
type CatKey = "ledger" | "facility" | "inspection";

const METHODS: { key: MethodKey; label: string; description: string }[] = [
  {
    key: "image",
    label: "画像読み込み",
    description:
      "Excelのような構造化データが無く、スキャン画像（PDF・JPG等）でしか残っていない資料を、画像1枚と最低限の基本情報だけで登録します。",
  },
  {
    key: "list",
    label: "一覧表",
    description: "管理番号ごとに多数の資料が一覧で並ぶ「一覧表」形式のExcelを、まとめて取り込みます。",
  },
  {
    key: "excel",
    label: "エクセル読み込み",
    description: "1件の資料について、様式（分野）に沿った詳細な項目を持つ専用のExcelファイルを取り込みます。",
  },
];

const CATS: { key: CatKey; label: string }[] = [
  { key: "ledger", label: "法令台帳" },
  { key: "facility", label: "施設台帳" },
  { key: "inspection", label: "点検調書" },
];

// 点検調書＞エクセル読み込みだけ、様式（分野）ごとに取込欄を分ける
// （検索・地図画面のINSPECTION_FIELDSと同じ分野名を使うが、あちらは検索条件、
// こちらは取込窓口という別の用途のため、あえて定義は独立させている）。
const EXCEL_INSPECTION_FORMS: { key: string; label: string }[] = [
  // 表示名は「防災」（会話ログ「「点検調書（災害）」を「点検調書（防災）」へ
  // 変更する」参照。keyは内部識別子のままdisasterで維持する）。
  { key: "disaster", label: "防災" },
  { key: "road", label: "道路" },
  { key: "river_coast", label: "河川・海岸" },
  { key: "airport", label: "空港" },
  { key: "sabo", label: "砂防" },
];

// 「道路」だけ、施設名称ごとにさらに様式（Excelの形式）が分かれる
// （検索・地図画面のINSPECTION_TYPES.roadと同じ施設名称だが、あちらは検索条件、
// こちらは取込窓口という別の用途のため定義は独立させている。会話ログ「門型標識の
// エクセルファイル...読み込んで表示できる仕様にしてください」参照）。
const ROAD_INSPECTION_TYPES: { key: string; label: string }[] = [
  { key: "bridge", label: "橋梁" },
  { key: "tunnel", label: "トンネル" },
  { key: "slope", label: "法面構造物" },
  { key: "gate_sign", label: "門型標識" },
  { key: "shed_shelter", label: "シェッド・シェルター" },
  { key: "large_culvert", label: "大型カルバート" },
];

type ReadyContent = { kind: "ready"; title: string; description: string; example: string; href: string };
type Combo = ReadyContent | { kind: "pending" } | { kind: "excel_inspection_forms" };

const COMBOS: Record<MethodKey, Record<CatKey, Combo>> = {
  image: {
    ledger: {
      kind: "ready",
      title: "台帳（画像）の登録",
      description:
        "トンネル調書等、Excelのような構造化データが無く、スキャン画像でしか残っていない台帳を、画像1枚と最低限の基本情報だけで登録します。分野・施設名称は道路・河川海岸・港湾等、種別を問いません（台帳名・路線名・所在地・緯度経度は任意項目です）。",
      example: "紙の台帳をスキャンした画像（PDF・JPG等）しか手元に無く、Excelデータが存在しない場合。",
      href: "/ledgers/new?docClass=LEGAL",
    },
    facility: {
      kind: "ready",
      title: "台帳（画像）の登録",
      description:
        "トンネル台帳等、Excelのような構造化データが無く、スキャン画像でしか残っていない台帳を、画像1枚と最低限の基本情報だけで登録します。分野・施設名称は道路・河川海岸・港湾等、種別を問いません（台帳名・路線名・所在地・緯度経度は任意項目です）。",
      example: "紙の台帳をスキャンした画像（PDF・JPG等）しか手元に無く、Excelデータが存在しない場合。",
      href: "/ledgers/new?docClass=FACILITY",
    },
    inspection: { kind: "pending" },
  },
  list: {
    ledger: { kind: "pending" },
    facility: {
      kind: "ready",
      title: "一覧読み込み",
      description:
        "管理番号・路線名・所在地・緯度経度・直近点検の健全度等が一覧で並ぶ「施設一覧」形式のExcelを取り込みます。法面構造物・道路標識・橋梁等、施設種別は問いません。管理番号ごとにDBへ登録し、地図にピンで表示します。",
      example: "「施設一覧」「◯◯台帳」といった、多数の施設が一覧表になったExcelを受け取った場合（防災カルテ様式そのものではないもの）。",
      href: "/facility-list/import",
    },
    inspection: { kind: "pending" },
  },
  excel: {
    ledger: { kind: "pending" },
    // 橋梁台帳（BridgeLedger。橋梁調書・橋梁台帳・画像・付属図の4シート構成）は、
    // 以前「点検調書」分類に置いていたが、内容は実際には点検記録ではなく橋梁の
    // 基本諸元・構造設計等の台帳（施設台帳の一種）であるため、分類を「施設台帳」
    // に訂正した（会話ログ「橋梁台帳読み込みは点検調書ではなくても、施設台帳に
    // 分類すると思います。区分が違うので修正してください」参照）。合わせて
    // ルートも/inspections/bridgesから/bridge-ledgersへ変更し（「点検調書」を
    // 意味する/inspections配下から外した）、点検調書＞道路＞橋梁には別途、
    // 実際の定期点検報告書（BridgeInspection）の取込を新設した（下記参照）。
    facility: {
      kind: "ready",
      title: "橋梁台帳の取込",
      description:
        "「橋梁調書・橋梁台帳・画像・付属図」の4シート構成の橋梁台帳Excelを取り込みます。Excel内の管理番号（例:「P72-AB-911702」）で、施設台帳（橋梁）と自動的に紐付きます。基本諸元（橋梁調書）は項目ごとに、構造設計・数量計算等の密な帳票（橋梁台帳）は元Excelの見た目のまま取り込まれます。",
      example: "「P72-AB-911702_01_藤谷島橋.xlsx」のような、橋梁1橋ごとの橋梁台帳ファイル。複数ファイルをまとめて取り込めます。",
      href: "/bridge-ledgers/import",
    },
    inspection: { kind: "excel_inspection_forms" },
  },
};

export default async function ImportHubPage({
  searchParams,
}: {
  searchParams: Promise<{ method?: string; cat?: string; form?: string; roadType?: string }>;
}) {
  const params = await searchParams;
  const method = (["image", "list", "excel"] as const).includes(params.method as MethodKey)
    ? (params.method as MethodKey)
    : null;
  const cat = (["ledger", "facility", "inspection"] as const).includes(params.cat as CatKey)
    ? (params.cat as CatKey)
    : null;
  const form = params.form ?? "disaster";
  const roadType = params.roadType ?? "";

  const combo = method && cat ? COMBOS[method][cat] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 検索・一覧に戻る
      </Link>
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">資料読み込み</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          まず取込方法を選び、次にどの分類（法令台帳・施設台帳・点検調書）の資料かを選んでください。
          分類は検索・地図画面と同じ3分類です（島根県公共土木施設台帳の分類に準拠）。
        </p>
      </div>

      {/* --- 1段階目: 取込方法 --- */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">1. 取込方法を選ぶ</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {METHODS.map((m) => (
            <Link
              key={m.key}
              href={`/import?method=${m.key}`}
              className={`rounded border p-3 text-left ${
                method === m.key
                  ? "border-gray-800 bg-gray-50 dark:border-gray-200 dark:bg-gray-800"
                  : "border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
              }`}
            >
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{m.label}</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{m.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* --- 2段階目: 分類 --- */}
      {method && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">2. 分類を選ぶ</h2>
          <div className="flex flex-wrap gap-1.5">
            {CATS.map((c) => (
              <Link
                key={c.key}
                href={`/import?method=${method}&cat=${c.key}`}
                className={`rounded-full border px-3 py-1 text-sm ${
                  cat === c.key
                    ? "border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900"
                    : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
                }`}
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* --- 3段階目（該当する場合のみ）／結果表示 --- */}
      {combo && combo.kind === "ready" && (
        <Link
          href={combo.href}
          className="block rounded border border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
        >
          <div className="px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{combo.title}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{combo.description}</p>
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              <span className="font-medium text-gray-500 dark:text-gray-400">対象例：</span>
              {combo.example}
            </p>
          </div>
        </Link>
      )}
      {combo && combo.kind === "pending" && (
        <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
          準備中です。この組み合わせ（{METHODS.find((m) => m.key === method)?.label} ×{" "}
          {CATS.find((c) => c.key === cat)?.label}）はまだ対応していません。
        </p>
      )}
      {combo && combo.kind === "excel_inspection_forms" && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">3. 様式（分野）を選ぶ</h2>
          <div className="flex flex-wrap gap-1.5">
            {EXCEL_INSPECTION_FORMS.map((f) => (
              <Link
                key={f.key}
                href={`/import?method=excel&cat=inspection&form=${f.key}`}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  form === f.key
                    ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500"
                    : f.key === "disaster" || f.key === "road"
                      ? "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
                      : "border-dashed border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600"
                }`}
              >
                {f.label}
                {f.key !== "disaster" && f.key !== "road" && "（準備中）"}
              </Link>
            ))}
          </div>
          {form === "disaster" ? (
            <>
              <Link
                href="/karte/import"
                className="block rounded border border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
              >
                <div className="px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">防災カルテExcelの取込</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    様式Ａ〜Ｄ（点検地点位置図・詳細スケッチ・点検履歴・災害履歴）を含む、防災カルテ様式のExcelファイル（全国地質調査業協会連合会版）を取り込みます。写真も自動で取り込まれます。
                  </p>
                  <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <span className="font-medium text-gray-500 dark:text-gray-400">対象例：</span>
                    県土整備事務所から配布される、防災カルテ様式そのもののExcelファイルを受け取った場合。
                  </p>
                </div>
              </Link>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Excelも画像も無い場合は、
                <Link href="/karte/new" className="text-blue-600 dark:text-blue-400 hover:underline">
                  手入力で新規登録
                </Link>
                することもできます。
              </p>
            </>
          ) : form === "road" ? (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">4. 施設名称を選ぶ</h2>
              <div className="flex flex-wrap gap-1.5">
                {ROAD_INSPECTION_TYPES.map((t) => (
                  <Link
                    key={t.key}
                    href={`/import?method=excel&cat=inspection&form=road&roadType=${t.key}`}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      roadType === t.key
                        ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500"
                        : t.key === "gate_sign" || t.key === "bridge"
                          ? "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
                          : "border-dashed border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600"
                    }`}
                  >
                    {t.label}
                    {t.key !== "gate_sign" && t.key !== "bridge" && "（準備中）"}
                  </Link>
                ))}
              </div>
              {roadType === "gate_sign" ? (
                <Link
                  href="/inspections/gate-signs/import"
                  className="block rounded border border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                >
                  <div className="px-4 py-3">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">門型標識点検調書の取込</h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      「別紙２　様式１様式２」形式の門型標識点検調書Excelを取り込みます。ファイル名の先頭の管理番号（例:「A01-AE-010474」）で、施設台帳（道路標識）と自動的に紐付きます。写真も自動で取り込まれます。
                    </p>
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      <span className="font-medium text-gray-500 dark:text-gray-400">対象例：</span>
                      「A01-AE-010474_01_松江島根線_松江市上乃木町_0.54_門型標識柱.xlsx」のような、門型標識1基ごとの点検調書ファイル。複数ファイルをまとめて取り込めます。
                    </p>
                  </div>
                </Link>
              ) : roadType === "bridge" ? (
                <Link
                  href="/inspections/bridges/import"
                  className="block rounded border border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                >
                  <div className="px-4 py-3">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">橋梁定期点検調書の取込</h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      「別紙２　様式１様式２」形式の橋梁定期点検調書Excelを取り込みます。Excel内の橋梁番号（管理番号）で、施設台帳（橋梁）と自動的に紐付きます。損傷箇所ごとの写真・所見も自動で取り込まれます。
                    </p>
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      <span className="font-medium text-gray-500 dark:text-gray-400">対象例：</span>
                      「G57-AB-908913_01_富田橋.xlsx」のような、橋梁1橋ごとの定期点検調書ファイル。複数ファイルをまとめて取り込めます。
                    </p>
                  </div>
                </Link>
              ) : roadType ? (
                <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                  準備中です。この施設名称の点検調書Excel取込はまだ対応していません。
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
              準備中です。この様式（分野）の点検調書Excel取込はまだ対応していません。
            </p>
          )}
        </div>
      )}

      <div className="rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 text-sm">
        <p className="font-medium text-gray-700 dark:text-gray-200">既に取り込んだ資料の確認</p>
        <div className="mt-2 flex flex-wrap gap-4">
          <Link href="/ledgers" className="text-blue-600 dark:text-blue-400 hover:underline">
            台帳（画像）一覧を見る →
          </Link>
          <Link href="/facility-list" className="text-blue-600 dark:text-blue-400 hover:underline">
            施設台帳を見る →
          </Link>
          <Link href="/bridge-ledgers" className="text-blue-600 dark:text-blue-400 hover:underline">
            橋梁台帳を見る →
          </Link>
          <Link href="/karte/import" className="text-blue-600 dark:text-blue-400 hover:underline">
            点検調書（防災）の取込履歴を見る →
          </Link>
          <Link href="/inspections/gate-signs" className="text-blue-600 dark:text-blue-400 hover:underline">
            点検調書（門型標識）を見る →
          </Link>
          <Link href="/inspections/bridges" className="text-blue-600 dark:text-blue-400 hover:underline">
            点検調書（橋梁）を見る →
          </Link>
        </div>
      </div>
    </div>
  );
}
