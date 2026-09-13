import type { ReactNode } from "react";
import Link from "next/link";
import Form from "next/form";
import { type Prisma, type FacilityLedgerDocClass, KarteType, ResponseCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL, responseMeta, RESPONSE_META, formatFacilityType, FACILITY_LEDGER_DOC_CLASS_LABEL } from "@/lib/labels";
import MapView from "@/components/MapLoader";
import type { MapKarte, HomeLocation, MapLedger, MapFacilityListItem, MapGateSignInspection } from "@/components/MapLoader";
import SearchHistoryPanel from "@/components/SearchHistoryPanel";
import { getStartEndRecordPhotos } from "@/lib/map-photos";
import {
  getKarteRouteNameOptions,
  getFacilityListRouteNameOptions,
  getFacilityListSoundnessGradeOptions,
  getFacilityLedgerRouteNameOptions,
} from "@/lib/reference-data";
import {
  FACILITY_FIELDS,
  FACILITY_TYPES,
  FACILITY_LEDGER_ITEM_FIELDS,
  FACILITY_LEDGER_ITEM_TYPES,
  type FieldKey,
} from "@/lib/facility-taxonomy";
import SearchSubmitButton from "@/components/SearchSubmitButton";
import PendingLink from "@/components/PendingLink";

// 点検記録は随時更新されるため静的プリレンダリングはせず、常に最新をDBから取得する
// （ビルド時にDBへ接続できない環境でもビルドが通るようにする副次効果もある）。
export const dynamic = "force-dynamic";

// 検索条件は「点検調書」側と「施設台帳」側で完全に別のキーにしている
// （対象施設・対象事象が異なるため、絞り込み条件も別物になる。詳細はGROUPS参照:
// app/import/page.tsx）。KARTE_PARAM_KEYS/FACILITY_PARAM_KEYSは、hasSearched判定
// （キーの有無で判定）・条件クリア・もう片方の検索状態の保持（隠しinputでの引き継ぎ）
// の3箇所で共通して使うため、配列としてまとめている。
const KARTE_PARAM_KEYS = [
  "q",
  "routeName",
  "routeNo",
  "location",
  "karteType",
  "responseCategory",
  "landmark",
] as const;
const FACILITY_PARAM_KEYS = [
  "fq",
  "facRouteName",
  "facLocation",
  "facBunya",
  "facShisetsu",
  "soundnessGrade",
  "facName",
] as const;
// 法令台帳タブの分野・施設名称は、検索クエリを一切持たない（DBに問い合わせない）
// 表示専用の状態のため、上記2つの配列（hasSearched判定・条件クリア・タブ間引き継ぎに
// 使う）には含めない。かつ、施設台帳側のfacBunya/facShisetsuとは別名のパラメータ
// （ledgerBunya/ledgerShisetsu）にする。以前、法令台帳と施設台帳で同じ`bunya`
// パラメータ名を共有していたところ、法令台帳側で分野を選ぶとFACILITY_PARAM_KEYSの
// 「bunyaキーがURLに存在する」判定が誤って真になり、施設台帳側が絞り込み無しの
// 全件を検索・地図表示してしまう不具合が実際に発生した（ユーザー指摘により発覚）。
// タブごとに完全に別のパラメータ名にすることで、この種の混線を構造的に防ぐ。
const LEDGER_PARAM_KEYS = ["ledgerBunya", "ledgerShisetsu", "ledgerName"] as const;

// ── 分類体系（島根県公共土木施設台帳の分類。会話ログ参照） ─────────────────
// 最上位タブは「法令台帳」「施設台帳」「点検調書」の3つで、それぞれ完全に独立した
// 「分野→施設名称」の階層を持つ（法令台帳内の「道路」と施設台帳内の「道路」は
// 別物であり、まとめない。ユーザー指摘済み）。
//
// 現時点では実データ・実機能があるのは「施設台帳」タブの道路分野（法面構造物・
// 道路標識）と、「法令台帳」タブの道路×トンネル（既存の/ledgers機能）のみ。
// それ以外は分類の骨格だけを表示し、選択すると「準備中」と案内する
// （ユーザー指示: 「とりあえずは、表示画面のみで内容はなくて構いません」）。
//
// 法令台帳タブの分野・施設名称（FACILITY_FIELDS/TYPES）は、台帳（画像）登録
// フォーム（components/FacilityLedgerForm.tsx）の種別選択でも同じものを使うため
// lib/facility-taxonomy.tsに切り出した。
type FieldDef = { key: FieldKey; label: string };
// 施設名称のmatchは、実データのfacilityType/facilitySubType文字列に対する
// 部分一致キーワード（いずれかを含めば該当）。matchが無いものは実データが無く
// 未検証のため、選択すると「準備中」表示になる。
type FacilityTypeDef = { label: string; match?: string[] };

// 施設台帳タブの分野・施設名称（FACILITY_LEDGER_ITEM_FIELDS/TYPES）は、
// 台帳（画像）登録画面の「施設台帳から選んで自動入力」ピッカー
// （app/ledgers/new/page.tsx）でも同じ絞り込みを使うため、lib/facility-taxonomy.ts
// に切り出して共有している（会話ログ「施設台帳の道路の橋梁の路線名のように選択
// できるようにしてほしい」参照）。
// 点検調書タブの分野。「災害」が防災カルテ点検（Karte）に対応する唯一の
// 実装済み分野で、それ以外はShimaneのページの【点検調書一覧】表をそのまま
// 転記したもの（「災害」はこの表に無いアプリ独自の拡張のため、ここにだけ
// 追加している）。それ以外の分野は施設台帳と同じく施設名称のドリルダウンを
// 持つが、独立して用意したINSPECTION_TYPESを使う（法令台帳・施設台帳の
// FACILITY_FIELDS/TYPES・FACILITY_LEDGER_ITEM_TYPESとは別物。3つの表で
// 分野・施設名称の内訳が異なるため、同じ「道路」「河川・海岸」という名前でも
// 中身は別データという方針で使い回さない。会話ログ「法令台帳と施設台帳が
// ごっちゃになっていますね」参照）。
const INSPECTION_FIELDS: FieldDef[] = [
  { key: "disaster", label: "災害" },
  { key: "road", label: "道路" },
  { key: "river_coast", label: "河川・海岸" },
  { key: "port", label: "港湾" },
  { key: "airport", label: "空港" },
  { key: "sabo", label: "砂防" },
  { key: "park", label: "公園" },
];
// 点検調書側はFacilityInspectionRecordの横断検索がまだ無いため、全ての
// 施設名称が未実装（matchが無い＝準備中）。
const INSPECTION_TYPES: Record<FieldKey, FacilityTypeDef[]> = {
  road: [
    { label: "橋梁" },
    { label: "トンネル" },
    { label: "法面構造物" },
    { label: "門型標識" },
    { label: "シェッド・シェルター" },
    { label: "大型カルバート" },
  ],
  river_coast: [{ label: "河川管理施設" }, { label: "ダム施設" }],
  port: [{ label: "港湾施設" }, { label: "海岸保全施設" }],
  airport: [{ label: "空港施設" }],
  sabo: [
    { label: "砂防えん堤" },
    { label: "渓流保全工" },
    { label: "地すべり防止施設" },
    { label: "急傾斜地崩壊防止施設" },
    { label: "雪崩対策施設" },
  ],
  park: [{ label: "都市公園" }],
};

type SearchParams = {
  q?: string; // 施設管理番号（カルテ側）
  routeName?: string;
  routeNo?: string;
  location?: string;
  karteType?: string; // 災害区分
  responseCategory?: string;
  // 点検調書（災害）には施設台帳のような「施設名称」列が無いため、代わりに
  // 位置目印（landmark）を名前検索の対象にする（会話ログ「いずれも名前による
  // 検索ができません」参照。Karteに施設名称に相当する列が無いため、最も近い
  // 概念として位置目印を採用した）。
  landmark?: string;
  fq?: string; // 管理番号（施設台帳側）
  facRouteName?: string;
  facLocation?: string;
  // 施設名称（FacilityListItem.facilityName／台帳（画像）のname・managementNo）
  // による検索（会話ログ「施設台帳...について...名前による検索ができません」参照）。
  facName?: string;
  // 分野・施設名称は、タブごとに完全に別のパラメータ名にしている（facBunya/
  // ledgerBunya/inspBunyaを共有すると、片方のタブで分野を選んだだけでもう片方の
  // hasSearched判定まで真になってしまう不具合が実際に発生したため。会話ログ参照）。
  facBunya?: string; // 施設台帳タブの分野
  facShisetsu?: string; // 施設台帳タブの施設名称
  ledgerBunya?: string; // 法令台帳タブの分野
  ledgerShisetsu?: string; // 法令台帳タブの施設名称
  // 法令台帳タブの名称検索（台帳（画像）のname・managementNo）。法令台帳タブは
  // 他に検索クエリを持たないため単独のパラメータにしている。
  ledgerName?: string;
  inspBunya?: string; // 点検調書タブの分野（既定は"disaster"＝災害）
  inspShisetsu?: string; // 点検調書タブの施設名称（分野が"disaster"以外のとき）
  soundnessGrade?: string;
  cat?: string; // 最上位タブ: "ledger"（法令台帳）|"facility"（施設台帳）|"inspection"（点検調書。既定）
  view?: string; // "list" のときだけ地図の代わりに一覧表示にする（既定は地図）
};

// 現在のsearchParamsから、指定したキー群を除いた（またはoverridesで上書きした）
// クエリ文字列を作る。「キーが存在するかどうか」でhasSearched等を判定しているため、
// 単に値を""にするのではなく、キーそのものを含めるかどうかを制御できるようにしている。
function buildQuery(
  params: SearchParams,
  options: { remove?: readonly string[]; overrides?: Partial<SearchParams> } = {}
): string {
  const usp = new URLSearchParams();
  const merged: SearchParams = { ...params, ...options.overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (options.remove?.includes(key)) continue;
    if (value !== undefined) usp.set(key, value);
  }
  return usp.toString();
}

// 「地図を中心とした画面」（ホーム画面）。指示書19章の方針に沿い、検索画面（6章）・
// カルテ一覧画面（8章）・地図検索画面（7章）を1画面に統合している。
//
// 検索条件パネルは、島根県の公共土木施設台帳の分類（会話ログ参照。
// https://www.pref.shimane.lg.jp/infra/kouji/kouji_info/rokyuka/manual.html）に
// 合わせ、最上位を「法令台帳」「施設台帳」「点検調書」の3タブに分けている
// （以前は「防災カルテ点検」「施設一覧」の2タブだった。防災カルテ点検は
// 「点検調書」タブの中の「災害」という分野に位置づけを変えた）。
// 3タブはそれぞれ完全に独立した「分野→施設名称」の階層を持ち、同じ名前の
// 分野（例: どのタブにも「道路」がある）が出てきても中身は別物として扱う
// （FACILITY_LEDGER_ITEM_FIELDS等、タブごとに別々の定数にしているのはそのため。
// 法令台帳タブのFACILITY_FIELDS/TYPESはlib/facility-taxonomy.tsで定義し、台帳
// （画像）登録フォームcomponents/FacilityLedgerForm.tsxと共有している）。
//
// 現時点で実データ・実機能があるのは「施設台帳」タブの道路分野（法面構造物・
// 道路標識。FacilityListItem）、「点検調書」タブの災害分野（Karte）、
// 「法令台帳」タブの道路×トンネル（既存の/ledgers機能）のみ。それ以外の
// 分野・施設名称は分類の骨格（ボタン）だけを表示し、選択すると「準備中」と
// 案内する（ユーザー指示: 「とりあえずは、表示画面のみで内容はなくて構いません」）。
//
// 施設台帳側は、法面構造物・道路標識等の道路附属物・橋梁等、施設種別を問わず
// 同じ「施設一覧」形式のExcelから取り込まれたデータをまとめて検索する
// （詳細はapp/import/page.tsxのコメント参照）。ただし管理番号・路線名・所在地は
// 施設台帳・点検調書のどちらでも意味が同じ条件のため、タブの外（上）に共通
// フィールドとして1つだけ配置し、タブ内には各系統固有の条件だけを置く。
// 共通フィールドの実体（name属性）はタブごとに異なるDB項目に対応する
// （点検調書側はq/routeName/location、施設台帳側はfq/facRouteName/
// facLocation）が、これは表示中のタブに応じてinputのnameを切り替えることで
// 実現している（下記JSX参照）。法令台帳タブは検索対象データが無いため、
// 共通フィールドの対象外。
//
// 地図には、検索済みの系統のピンだけを表示する（未検索の系統は表示しない＝「防災カルテ
// と同じように検索時に表示される」という要望に対応）。タブを切り替えても、もう一方の
// 検索結果は消えない（互いの検索状態を隠しinputで引き継いでいるため）。台帳（画像。
// FacilityLedger）も同様に、現在のタブ（docClass）・分野・施設名称（細別）が
// 特定されるまでは表示しない（以前は分類を問わず常時表示していたが、他タブ・他分類の
// 台帳が地図に残り続ける不具合になっていたため。上記ledgerWhere参照）。
//   - 画面いっぱい（ヘッダー直下〜画面下端）を使い、左に検索条件パネル、
//     中央（残り全体）に地図を常時表示する（PCでの基本レイアウト）。
//   - 初期表示（条件無し）では地図だけを見せ、一覧テーブルは出さない。
//   - 「一覧」表示への切替はパネル上部のリンク（現在のタブ・両系統の検索条件を維持した
//     まま、viewだけ書き換えたクエリへのリンク）で行う。
//   - 初期表示（一度も検索していない状態）では、検索クエリ自体を実行しない
//     （下記hasSearched/hasFacSearched参照）。系統ごとに独立して判定する。
export default async function KarteListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view: "map" | "list" = params.view === "list" ? "list" : "map";
  const cat: "ledger" | "facility" | "inspection" =
    params.cat === "ledger" ? "ledger" : params.cat === "facility" ? "facility" : "inspection";
  // 点検調書タブの分野（既定は「災害」＝従来の防災カルテ点検）・施設名称。
  const inspectionBunya = cat === "inspection" ? (params.inspBunya ?? "disaster") : "disaster";
  const inspectionShisetsu =
    cat === "inspection" && inspectionBunya !== "disaster" ? (params.inspShisetsu ?? null) : null;
  // 施設台帳タブの分野・施設名称（未選択の場合はnull）。
  const facilityBunya = cat === "facility" ? (params.facBunya ?? null) : null;
  const facilityShisetsu = cat === "facility" && facilityBunya ? (params.facShisetsu ?? null) : null;
  // 法令台帳タブの分野・施設名称。
  const ledgerBunya = cat === "ledger" ? (params.ledgerBunya ?? null) : null;
  const ledgerShisetsu = cat === "ledger" && ledgerBunya ? (params.ledgerShisetsu ?? null) : null;

  // ---- 点検調書＞災害（旧・防災カルテ点検）側 ----
  const where: Prisma.KarteWhereInput = {};
  if (params.q) {
    where.facilityNo = { contains: params.q, mode: "insensitive" };
  }
  if (params.routeName) {
    where.routeName = params.routeName;
  }
  if (params.routeNo) {
    where.routeNo = { contains: params.routeNo, mode: "insensitive" };
  }
  if (params.landmark) {
    where.landmark = { contains: params.landmark, mode: "insensitive" };
  }
  // <select>のoption値はKARTE_TYPE_LABEL/RESPONSE_METAのキー（＝enumのメンバー名そのもの）
  // からしか生成していないため、想定外の値が来ることはない前提でキャストする。
  if (params.karteType && params.karteType in KarteType) {
    where.karteType = params.karteType as KarteType;
  }
  if (params.responseCategory && params.responseCategory in ResponseCategory) {
    where.responseCategory = params.responseCategory as ResponseCategory;
  }

  const hasCondition = KARTE_PARAM_KEYS.some((k) => params[k]);
  // 「検索が実行されたかどうか」は、条件の値ではなくURLにそのキー自体が
  // 含まれているかで判定する（値が空でも、フォーム送信時はname付きの全フィールドが
  // 送られるため`q=`のようにキーは残る）。ただし、点検調書タブの共通フィールド
  // （管理番号・路線名・所在地）は「災害」以外の分野（道路等）でも同じname（q/
  // routeName/location）で送信されるため、分野を問わずKARTE_PARAM_KEYSのキーが
  // 存在するだけでhasSearchedをtrueにすると、道路＞門型標識を検索しただけで
  // 絞り込み無しのカルテ（災害）が全件表示されてしまう不具合になっていた
  // （ユーザー指摘: 「選択していない災害(防災カルテ)のピンが表示されました」）。
  // 「災害」分野を見ているときだけカルテを検索対象にする。
  const hasSearched = inspectionBunya === "disaster" && KARTE_PARAM_KEYS.some((k) => k in params);

  // ---- 施設台帳側（FacilityListItem） ----
  // 分野・施設名称は、島根県の分類体系（FACILITY_LEDGER_ITEM_FIELDS/TYPES）の
  // キーワードで、実データのfacilityType/facilitySubTypeを部分一致検索する
  // （どちらも自由記述文字列であり厳密なコード値ではないため。lib/labels.tsの
  // formatFacilityType・components/MapView.tsxのfacilityIconEmojiと同じ考え方）。
  const facAndConditions: Prisma.FacilityListItemWhereInput[] = [];
  if (params.fq) {
    facAndConditions.push({ managementNo: { contains: params.fq, mode: "insensitive" } });
  }
  if (params.facRouteName) {
    facAndConditions.push({ routeName: params.facRouteName });
  }
  if (params.facLocation) {
    facAndConditions.push({ location: { contains: params.facLocation, mode: "insensitive" } });
  }
  if (params.soundnessGrade) {
    facAndConditions.push({ soundnessGrade: params.soundnessGrade });
  }
  if (params.facName) {
    // 施設名称（実データのfacilityName列。管理番号とは別物）による検索
    // （会話ログ「施設台帳...について...名前による検索ができません」参照）。
    // 管理番号（fq）と同様、分野・施設名称の絞り込みとは独立して機能する
    // （下のガード条件が!params.facNameを条件に加えているのはこのため。
    // 名称で見つけたい場合、細別を選び切っていなくても検索できるようにする）。
    facAndConditions.push({ facilityName: { contains: params.facName, mode: "insensitive" } });
  }
  const facilityShisetsuDef =
    facilityBunya && facilityShisetsu
      ? FACILITY_LEDGER_ITEM_TYPES[facilityBunya]?.find((t) => t.label === facilityShisetsu)
      : undefined;
  if (facilityShisetsu && facilityShisetsuDef?.match) {
    facAndConditions.push({
      OR: facilityShisetsuDef.match.flatMap((kw) => [
        { facilityType: { contains: kw } },
        { facilitySubType: { contains: kw } },
      ]),
    });
  } else if ((facilityShisetsu || facilityBunya) && !params.facName) {
    // 施設名称（細別）がまだ選ばれていない場合（分野のみ選択、または準備中の
    // 施設名称が選ばれた場合）は、意図的に0件にする。以前は分野のみ選択時に
    // FACILITY_LEDGER_ITEM_FIELD_MATCHで分野全体を広く一致させていたが、細別を
    // 選ぶ前から該当しそうな施設が全て表示されてしまう不具合になっていたため、
    // 「施設名称まで特定されるまでは何も表示しない」方針に統一する
    // （ユーザー指摘: 「その細別を選択する前に道路に該当するすべてが表示されます」）。
    // ただし名称検索（facName）が指定されている場合は、細別を問わず横断的に
    // 探せることの方が有用なため、この0件化は行わない。
    facAndConditions.push({ id: "__no_data_yet__" });
  }
  const facWhere: Prisma.FacilityListItemWhereInput = facAndConditions.length > 0 ? { AND: facAndConditions } : {};
  const hasFacCondition = FACILITY_PARAM_KEYS.some((k) => params[k]);
  const hasFacSearched = FACILITY_PARAM_KEYS.some((k) => k in params);

  // 台帳（画像。FacilityLedger）の地図表示も、施設台帳と同じ「施設名称（細別）まで
  // 特定されるまでは何も表示しない」方針に統一する。以前はdocClass・分野・施設名称を
  // 一切見ずに常時全件表示していたため、例えばトンネル台帳を登録すると、施設台帳＞
  // 道路＞橋梁を見ているときにもトンネルの台帳が地図に残り続ける不具合になっていた
  // （ユーザー指摘）。法令台帳タブと施設台帳タブでdocClassが異なる（前者はLEGAL、
  // 後者はFACILITY）ため、現在表示中のタブに応じて対象docClassを切り替え、かつ
  // 施設名称の絞り込みキーワード（match）は各タブの分類定義（法令台帳:
  // FACILITY_TYPES／施設台帳: FACILITY_LEDGER_ITEM_TYPES）からそのまま流用する。
  // 点検調書タブには台帳（画像）に対応する分類が無いため、台帳は表示しない。
  const ledgerDocClass: FacilityLedgerDocClass | null =
    cat === "ledger" ? "LEGAL" : cat === "facility" ? "FACILITY" : null;
  const ledgerShisetsuDef =
    cat === "ledger"
      ? ledgerBunya && ledgerShisetsu
        ? FACILITY_TYPES[ledgerBunya]?.find((t) => t.label === ledgerShisetsu)
        : undefined
      : cat === "facility"
        ? facilityShisetsuDef
        : undefined;
  // 台帳の名称（name）・管理番号（managementNo）による検索。タブごとに別パラメータ
  // （法令台帳: ledgerName／施設台帳: facName）を使うが、対象はどちらもFacilityLedger
  // （会話ログ「法令台帳...について...名前による検索ができません」参照）。分野・
  // 施設名称の絞り込みキーワードとはORで組み合わせる（＝名称検索を指定すれば、
  // 細別を選び切っていなくても、あるいは選んだ細別と異なる分類の施設でも、名前が
  // 一致すれば横断的に見つけられる。一方、名称検索が空の場合は従来どおり細別が
  // 特定されるまで何も表示しない）。
  const ledgerNameQuery = cat === "ledger" ? params.ledgerName : cat === "facility" ? params.facName : undefined;
  const ledgerOrConditions: Prisma.FacilityLedgerWhereInput[] = [];
  if (ledgerShisetsuDef?.match) {
    ledgerOrConditions.push({
      OR: ledgerShisetsuDef.match.flatMap((kw) => [
        { facilityType: { contains: kw } },
        { facilitySubType: { contains: kw } },
      ]),
    });
  }
  if (ledgerNameQuery) {
    ledgerOrConditions.push({
      OR: [
        { name: { contains: ledgerNameQuery, mode: "insensitive" } },
        { managementNo: { contains: ledgerNameQuery, mode: "insensitive" } },
      ],
    });
  }
  const ledgerWhere: Prisma.FacilityLedgerWhereInput =
    ledgerDocClass && ledgerOrConditions.length > 0
      ? {
          docClass: ledgerDocClass,
          latitude: { not: null },
          longitude: { not: null },
          OR: ledgerOrConditions,
        }
      : { id: "__no_data_yet__" };

  // ---- 点検調書＞道路＞門型標識（GateSignInspection） ----
  // 台帳（画像）・施設一覧と同じ「呼び出し元で絞り込んでから渡す」方針。
  // 施設台帳（FacilityListItem）の道路標識行と管理番号で紐付いたデータのため、
  // 施設台帳と同様「分類（分野・施設名称）が特定されるまでは表示しない」
  // （会話ログ「点検調書タブの道路の門型標識を選択しても、施設台帳と連動した
  // 点検調書が表示されません...点検調書でも表示してほしい」参照）。他の分野
  // （橋梁・トンネル等）はまだ実データが無いため対象外。
  const gateSignReady = cat === "inspection" && inspectionBunya === "road" && inspectionShisetsu === "門型標識";
  const gateSignWhere: Prisma.GateSignInspectionWhereInput = gateSignReady
    ? { latitude: { not: null }, longitude: { not: null } }
    : { id: "__no_data_yet__" };

  // 路線名等の選択肢は自由入力だと表記ゆれで検索漏れが起きやすいため、実際に登録されて
  // いる値から選ぶセレクトボックスにしている（フィルタ条件に関わらず全件から候補を
  // 集める）。防災カルテ・施設一覧はデータが別物のため、選択肢も別々に集計する。
  // 台帳（画像。FacilityLedger）の路線名も同じ選択肢に加える（以前はここに含めて
  // おらず、画像取込みで登録した路線名が選択肢に出てこない不具合になっていた。
  // 会話ログ「路線名を...としていますが、これが初期の検索画面で表示されていません」
  // 参照）。ledgerRouteNameRowsは現在の絞り込み（ledgerWhere）に関わらず全件から
  // 集計する（他の2系統と同じ方針）。
  // パフォーマンス上の方針: このページで必要なクエリのうち、互いの結果に依存しない
  // ものは全て1つのPromise.allにまとめて同時発行する（通信のラウンドトリップ回数を
  // 減らすため）。kartesBeforeLocationFilter・facilityItemsは元々別々にawaitして
  // いたが、下記の通りここに合流できる。唯一getStartEndRecordPhotosだけは
  // kartesBeforeLocationFilterの結果（カルテのID一覧）が無いと発行できないため、
  // 後段で別途awaitする（＝直列3段階だったものを直列2段階に削減）。
  const [
    routeNameOptions,
    settings,
    facilityLedgersRaw,
    facRouteNameOptions,
    soundnessGradeOptions,
    ledgerRouteNameOptions,
    gateSignInspectionsRaw,
    kartesBeforeLocationFilter,
    facilityItems,
  ] = await Promise.all([
    // 路線名・健全性区分の選択肢は検索するたびに変わるものではないため、
    // lib/reference-data.tsで短時間（30秒）キャッシュしている
    // （詳細は同ファイルのコメント参照。従来はここで毎回DISTINCT検索していた）。
    getKarteRouteNameOptions(),
    prisma.appSettings.findUnique({ where: { id: "singleton" } }),
    prisma.facilityLedger.findMany({
      where: ledgerWhere,
      include: { images: { orderBy: { sortOrder: "asc" } } },
    }),
    getFacilityListRouteNameOptions(),
    getFacilityListSoundnessGradeOptions(),
    getFacilityLedgerRouteNameOptions(),
    prisma.gateSignInspection.findMany({
      where: gateSignWhere,
      orderBy: { createdAt: "desc" },
      include: {
        // 起点側・終点側の両方をポップアップに出すため、代表1枚だけでなく
        // 全景写真を全件取得する（通常は最大2枚。会話ログ「マップ上にも起点側と
        // 終点側の両方を表示してください」参照）。
        overviewPhotos: { orderBy: { sortOrder: "asc" } },
        facilityListItem: { select: { id: true } },
      },
    }),
    // 初期表示（まだ検索していない状態）では、検索クエリ自体を実行しない（データ件数が
    // 増えた場合のDB負荷・通信量・地図描画負荷を抑えるため。単にDBから全件取得して画面側
    // で非表示にするのではなく、クエリそのものをスキップする点がポイント）。
    // 以前はこの2クエリを上のPromise.allとは別に直列awaitしていたが、where/facWhereは
    // このPromise.all発行時点で既に確定しており、上記クエリ群の結果にも依存しないため、
    // ここに合流させてラウンドトリップを1段階減らしている（詳細は関数冒頭のコメント参照）。
    hasSearched
      ? prisma.karte.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          include: {
            targets: { select: { id: true } },
            events: {
              orderBy: { inspectionDate: "desc" },
              take: 1,
              select: { inspectionDate: true },
            },
            favorite: { select: { id: true } },
          },
        })
      : Promise.resolve([]),
    hasFacSearched
      ? prisma.facilityListItem.findMany({ where: facWhere, orderBy: { managementNo: "asc" } })
      : Promise.resolve([]),
  ]);
  // 路線名は共通フィールドとして1つの<select>にまとめるため、3系統の選択肢を
  // 合わせて（重複除去のうえ）1つのリストにする。
  const combinedRouteNameOptions = Array.from(
    new Set([...routeNameOptions, ...facRouteNameOptions, ...ledgerRouteNameOptions])
  ).sort((a, b) => a.localeCompare(b, "ja"));

  const mapLedgers: MapLedger[] = facilityLedgersRaw.map((l) => ({
    id: l.id,
    docClassLabel: FACILITY_LEDGER_DOC_CLASS_LABEL[l.docClass] ?? l.docClass,
    facilityTypeLabel: formatFacilityType(l.facilityType, l.facilitySubType),
    facilityType: l.facilityType,
    facilitySubType: l.facilitySubType,
    managementNo: l.managementNo,
    name: l.name,
    routeName: l.routeName,
    location: l.location,
    latitude: Number(l.latitude),
    longitude: Number(l.longitude),
    coverImageUrl: l.images[0]?.imageUrl ?? null,
    imageCount: l.images.length,
    note: l.note,
  }));

  const mapGateSignInspections: MapGateSignInspection[] = gateSignInspectionsRaw.map((g) => ({
    id: g.id,
    title: g.managementNo ?? g.sourceFileName ?? "（管理番号不明）",
    routeName: g.routeName,
    location: g.location,
    judgment: g.overallJudgment,
    inspectionDateLabel: g.inspectionDate ? new Date(g.inspectionDate).toLocaleDateString("ja-JP") : null,
    latitude: Number(g.latitude),
    longitude: Number(g.longitude),
    overviewPhotos: g.overviewPhotos.map((p) => ({ url: p.url, caption: p.caption })),
    facilityListItemId: g.facilityListItem?.id ?? null,
  }));

  const home: HomeLocation =
    settings?.homeLatitude != null && settings?.homeLongitude != null
      ? {
          latitude: Number(settings.homeLatitude),
          longitude: Number(settings.homeLongitude),
          label: settings.homeLabel,
        }
      : null;

  // 所在地はlocationDistrict（郡・市〜町村種別まで）とlocationTown（大字等）の2カラムに
  // 分けて格納しているが、検索条件では{district}{town}を結合した1つの文字列として
  // 見せている。DBのwhereでは絞り込まず、他の条件で絞り込んだ結果に対して結合済み
  // 文字列でJS側フィルタする（districtの末尾〜townの先頭にまたがる語を拾うため）。
  const kartes = params.location
    ? kartesBeforeLocationFilter.filter((k) => {
        const combined = [k.locationDistrict, k.locationTown].filter(Boolean).join(" ").toLowerCase();
        return combined.includes(params.location!.toLowerCase());
      })
    : kartesBeforeLocationFilter;

  // 地図用データ。検索フォームと同じ絞り込み結果からそのまま作る
  // （地図だけ別条件になってしまっていた従来の問題を防ぐ）。
  const kartesWithCoords = kartes.filter((k) => k.latitude != null && k.longitude != null);
  // マーカーのポップアップに表示する、起点／終点の参考写真（現状記録写真のうち
  // キャプションに「起点」「終点」を含むもの）。lib/map-photos.ts参照。
  const startEndPhotos = await getStartEndRecordPhotos(kartesWithCoords.map((k) => k.id));
  const mapKartes: MapKarte[] = kartesWithCoords.map((k) => ({
    id: k.id,
    facilityNo: k.facilityNo,
    routeName: k.routeName,
    karteTypeLabel: KARTE_TYPE_LABEL[k.karteType] ?? k.karteType,
    responseCategory: k.responseCategory,
    latitude: Number(k.latitude),
    longitude: Number(k.longitude),
    isFavorite: k.favorite != null,
    startPhotoUrl: startEndPhotos.get(k.id)?.startPhotoUrl,
    endPhotoUrl: startEndPhotos.get(k.id)?.endPhotoUrl,
    extensionLengthM: k.extensionLengthM != null ? Number(k.extensionLengthM) : null,
    location: [k.locationDistrict, k.locationTown].filter(Boolean).join(" ") || null,
    lastInspectionDateLabel: k.events[0]?.inspectionDate
      ? new Date(k.events[0].inspectionDate).toLocaleDateString("ja-JP")
      : null,
  }));
  const withoutCoordsCount = kartes.length - mapKartes.length;

  const facilityItemsWithCoords = facilityItems.filter((f) => f.latitude != null && f.longitude != null);
  const mapFacilityListItems: MapFacilityListItem[] = facilityItemsWithCoords.map((f) => ({
    id: f.id,
    managementNo: f.managementNo,
    officeName: f.officeName,
    routeName: f.routeName,
    facilityType: f.facilityType,
    facilitySubType: f.facilitySubType,
    location: f.location,
    latitude: Number(f.latitude),
    longitude: Number(f.longitude),
    soundnessGrade: f.soundnessGrade,
    inspectionDateLabel: f.inspectionDate ? new Date(f.inspectionDate).toLocaleDateString("ja-JP") : null,
    mainFindings: f.mainFindings,
    remarks: f.remarks,
  }));
  const facWithoutCoordsCount = facilityItems.length - mapFacilityListItems.length;

  // 「最近の検索」（左パネル下部）に記録する内容。表示方法（view）は検索条件では
  // ないため、記録対象からは除外する（一覧⇔地図の切替だけでは履歴を増やさない）。
  // 現状は防災カルテ側の検索のみを対象にしている（施設一覧側の履歴は今後の課題）。
  const historyParams = new URLSearchParams();
  if (params.q) historyParams.set("q", params.q);
  if (params.routeName) historyParams.set("routeName", params.routeName);
  if (params.routeNo) historyParams.set("routeNo", params.routeNo);
  if (params.location) historyParams.set("location", params.location);
  if (params.karteType) historyParams.set("karteType", params.karteType);
  if (params.responseCategory) historyParams.set("responseCategory", params.responseCategory);
  if (params.landmark) historyParams.set("landmark", params.landmark);
  const currentQueryString = historyParams.toString();

  const conditionLabels: string[] = [];
  if (params.q) conditionLabels.push(`番号:${params.q}`);
  if (params.routeName) conditionLabels.push(`路線:${params.routeName}`);
  if (params.routeNo) conditionLabels.push(`路線番号:${params.routeNo}`);
  if (params.location) conditionLabels.push(`所在地:${params.location}`);
  if (params.landmark) conditionLabels.push(`位置目印:${params.landmark}`);
  if (params.karteType && params.karteType in KarteType) {
    conditionLabels.push(KARTE_TYPE_LABEL[params.karteType as KarteType] ?? params.karteType);
  }
  if (params.responseCategory && params.responseCategory in ResponseCategory) {
    conditionLabels.push(RESPONSE_META[params.responseCategory as ResponseCategory]?.label ?? params.responseCategory);
  }
  const currentSearchLabel = conditionLabels.length > 0 ? conditionLabels.join(" ・ ") : null;

  const toggleViewHref = `/karte?${buildQuery(params, { overrides: { view: view === "list" ? "map" : "list" } })}`;
  const clearKarteHref = `/karte?${buildQuery(params, { remove: KARTE_PARAM_KEYS })}`;
  const clearFacHref = `/karte?${buildQuery(params, { remove: FACILITY_PARAM_KEYS })}`;
  // タブ切替時、共通フィールド（管理番号・路線名・所在地）に今入力済みの値を、
  // 切替先タブの項目名へそのまま引き継ぐ（同じ意味の条件を再入力させないため）。
  // 法令台帳タブには対応する共通フィールドが無いため、切替時に引き継ぐものは無い。
  const ledgerTabHref = `/karte?${buildQuery(params, { overrides: { cat: "ledger" } })}`;
  const facilityTabHref = `/karte?${buildQuery(params, {
    overrides: { cat: "facility", fq: params.q, facRouteName: params.routeName, facLocation: params.location },
  })}`;
  const inspectionTabHref = `/karte?${buildQuery(params, {
    overrides: { cat: "inspection", q: params.fq, routeName: params.facRouteName, location: params.facLocation },
  })}`;

  // 分野・施設名称ボタンのリンク先。分野を切り替えたときは、別の分野の施設名称が
  // 残らないよう施設名称をクリアする（buildQueryはoverridesの値がundefinedの
  // キーをクエリから除外する）。タブごとに別のパラメータ名を使うことで、
  // 他タブのhasSearched判定に影響しないようにしている（上記コメント参照）。
  const facilityFieldHref = (fieldKey: string) =>
    `/karte?${buildQuery(params, { overrides: { cat: "facility", facBunya: fieldKey, facShisetsu: undefined } })}`;
  const facilityShisetsuHref = (fieldKey: string, label: string) =>
    `/karte?${buildQuery(params, { overrides: { cat: "facility", facBunya: fieldKey, facShisetsu: label } })}`;
  const ledgerFieldHref = (fieldKey: string) =>
    `/karte?${buildQuery(params, { overrides: { cat: "ledger", ledgerBunya: fieldKey, ledgerShisetsu: undefined } })}`;
  const ledgerShisetsuHref = (fieldKey: string, label: string) =>
    `/karte?${buildQuery(params, { overrides: { cat: "ledger", ledgerBunya: fieldKey, ledgerShisetsu: label } })}`;
  const inspectionFieldHref = (fieldKey: string) =>
    `/karte?${buildQuery(params, { overrides: { cat: "inspection", inspBunya: fieldKey, inspShisetsu: undefined } })}`;
  const inspectionShisetsuHref = (fieldKey: string, label: string) =>
    `/karte?${buildQuery(params, { overrides: { cat: "inspection", inspBunya: fieldKey, inspShisetsu: label } })}`;

  return (
    // ヘッダー(h-14)を除いた画面の残り全体を、左の検索条件パネルと中央の地図/一覧で
    // 分け合う（このページだけの都合のレイアウトのため、他ページのようなmx-auto
    // max-w-*や余白は持たせず、<main>にも一律のpaddingを付けていない。
    // app/layout.tsxのコメント参照）。
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 lg:w-96">
        <h1 className="mb-1 text-lg font-bold text-gray-800 dark:text-gray-100">点検・台帳検索</h1>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          <PendingLink href={toggleViewHref} className="text-blue-600 dark:text-blue-400 hover:underline">
            {view === "list" ? "地図で表示する" : "検索結果を一覧で表示する"}
          </PendingLink>
        </p>

        {/* --- 最上位タブ（法令台帳／施設台帳／点検調書）。フォームの外に置き、
            単純なリンクで切り替える（法令台帳は検索フォーム自体を持たないため）。 */}
        <div className="mb-3 flex border-b border-gray-200 dark:border-gray-700">
          {(
            [
              { key: "ledger", label: "法令台帳", href: ledgerTabHref },
              { key: "facility", label: "施設台帳", href: facilityTabHref },
              { key: "inspection", label: "点検調書", href: inspectionTabHref },
            ] as const
          ).map((t) =>
            cat === t.key ? (
              <span
                key={t.key}
                className="border-b-2 border-gray-800 px-3 py-1.5 text-sm font-semibold text-gray-800 dark:border-gray-100 dark:text-gray-100"
              >
                {t.label}
              </span>
            ) : (
              <PendingLink
                key={t.key}
                href={t.href}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
              >
                {t.label}
              </PendingLink>
            )
          )}
        </div>

        {cat === "ledger" ? (
          // 法令台帳タブ：分野→施設名称のドリルダウンに加え、台帳名称（name・
          // managementNo）による検索フォームを持つ（会話ログ「法令台帳...について...
          // 名前による検索ができません」参照。以前は検索フォーム自体が無かったが、
          // ドリルダウンで細別を選ばなくても名前で横断的に探せるよう追加した）。
          // 台帳（画像。FacilityLedger）は分野・施設名称を問わず登録できるが
          // （/ledgers/new。会話ログ参照）、地図上での表示は施設台帳タブと同様、
          // ここで分野・施設名称（細別）まで選ぶか、名称検索を使ったときだけになる
          // （上記ledgerWhere参照）。
          <>
            <Form action="" className="mb-3 flex items-end gap-2">
              {/* ドリルダウンの選択（分野・施設名称）は、フォーム送信で消えないよう
                  隠しinputで引き継ぐ（施設台帳タブの隠しinputと同じ方針）。 */}
              <input type="hidden" name="cat" defaultValue="ledger" />
              {ledgerBunya && <input type="hidden" name="ledgerBunya" defaultValue={ledgerBunya} />}
              {ledgerShisetsu && <input type="hidden" name="ledgerShisetsu" defaultValue={ledgerShisetsu} />}
              <SearchField
                key={`ledgerName-${params.ledgerName ?? ""}`}
                name="ledgerName"
                label="名称（台帳名・管理番号）"
                defaultValue={params.ledgerName}
              />
              <SearchSubmitButton
                type="submit"
                targetView={view}
                className="shrink-0 rounded bg-gray-800 dark:bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600"
              >
                検索
              </SearchSubmitButton>
            </Form>
            {params.ledgerName && (
              <p className="-mt-2 mb-3">
                <PendingLink
                  href={`/karte?${buildQuery(params, { remove: ["ledgerName"] })}`}
                  className="text-xs text-gray-400 hover:underline dark:text-gray-500"
                >
                  名称検索をクリア
                </PendingLink>
              </p>
            )}
            <FieldDrilldown
              fields={FACILITY_FIELDS}
              types={FACILITY_TYPES}
              selectedField={ledgerBunya}
              selectedType={ledgerShisetsu}
              fieldHref={ledgerFieldHref}
              typeHref={ledgerShisetsuHref}
              clearHref={`/karte?${buildQuery(params, { remove: LEDGER_PARAM_KEYS })}`}
              renderSelection={() => (
                <p className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  この分類の法令台帳（画像）は、
                  <Link href="/import?method=image&cat=ledger" className="text-blue-600 dark:text-blue-400 hover:underline">
                    資料読み込み
                  </Link>
                  から登録できます。登録済みの台帳は
                  <Link href="/ledgers" className="text-blue-600 dark:text-blue-400 hover:underline">
                    台帳一覧
                  </Link>
                  （緯度経度があれば地図にも）で確認できます。
                </p>
              )}
            />
          </>
        ) : (
          // next/formの<Form>: action=""で「同じルートに検索条件だけ変えて遷移」という
          // 従来のGETフォームと同じ挙動を保ちつつ、クライアント側遷移
          // （ページ全体のリロードをしない）とloading.tsxのフォールバック表示を
          // 有効にする。SearchSubmitButtonがuseFormStatus()で送信中を検知し、
          // 即座にスピナー表示できるのもこの<Form>の子孫だからこそ。
          // 表示中のタブに応じて、共通フィールドのname属性・タブ固有フィールドの
          // 内容を切り替える（1つのフォームで両系統をカバーする）。
          <Form action="" className="space-y-3">
            {/* 表示方法（地図/一覧）・現在のタブは、送信ボタンのname/valueではなくこの
                隠しinputで保持する（SearchSubmitButtonのコメント参照）。 */}
            <input type="hidden" name="view" defaultValue={view} />
            <input type="hidden" name="cat" defaultValue={cat} />
            {/* 表示していない方のタブが検索済みの場合のみ、その現在値を隠しinputで引き継ぐ
                （このフォームの送信で相手側の検索状態を消してしまわないため。未検索の
                場合は何も引き継がない＝相手側もhasXSearched=falseのまま維持される）。 */}
            {cat === "inspection" &&
              hasFacSearched &&
              FACILITY_PARAM_KEYS.map((k) => <input key={k} type="hidden" name={k} defaultValue={params[k] ?? ""} />)}
            {cat === "facility" &&
              hasSearched &&
              KARTE_PARAM_KEYS.map((k) => <input key={k} type="hidden" name={k} defaultValue={params[k] ?? ""} />)}
            {/* 施設台帳タブの分野・施設名称は、リンク（ボタン）で切り替えるため通常の
                フォーム項目ではない。この隠しinputで、フォーム送信（検索・条件変更）時にも
                現在の選択を維持する。 */}
            {cat === "facility" && facilityBunya && (
              <input type="hidden" name="facBunya" defaultValue={facilityBunya} />
            )}
            {cat === "facility" && facilityShisetsu && (
              <input type="hidden" name="facShisetsu" defaultValue={facilityShisetsu} />
            )}
            {cat === "inspection" && <input type="hidden" name="inspBunya" defaultValue={inspectionBunya} />}
            {cat === "inspection" && inspectionShisetsu && (
              <input type="hidden" name="inspShisetsu" defaultValue={inspectionShisetsu} />
            )}

            {/* --- 共通フィールド（管理番号・路線名・所在地）。点検調書・施設台帳の
                どちらでも意味が同じ条件のため、タブの外に1つだけ配置する。name属性は
                表示中のタブに応じて切り替える。 */}
            <SearchField
              key={`num-${cat}-${(cat === "inspection" ? params.q : params.fq) ?? ""}`}
              name={cat === "inspection" ? "q" : "fq"}
              label="管理番号"
              defaultValue={cat === "inspection" ? params.q : params.fq}
            />
            <div>
              <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">路線名</label>
              {/* keyにdefaultValueを含めることで、リンク経由の遷移（タブ切替・条件クリア・
                  最近の検索等）でこのフィールドの値が変わった時にDOMごと作り直させ、
                  defaultValueが再適用されるようにしている（uncontrolledな要素は
                  マウント時にしかdefaultValueが効かないため）。 */}
              <select
                key={`route-${cat}-${(cat === "inspection" ? params.routeName : params.facRouteName) ?? ""}`}
                name={cat === "inspection" ? "routeName" : "facRouteName"}
                defaultValue={(cat === "inspection" ? params.routeName : params.facRouteName) ?? ""}
                className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">すべて</option>
                {combinedRouteNameOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <SearchField
              key={`loc-${cat}-${(cat === "inspection" ? params.location : params.facLocation) ?? ""}`}
              name={cat === "inspection" ? "location" : "facLocation"}
              label="所在地"
              defaultValue={cat === "inspection" ? params.location : params.facLocation}
            />
            {cat === "facility" && (
              // 施設名称（facilityName列。管理番号とは別物）による検索
              // （会話ログ「施設台帳...について...名前による検索ができません」参照）。
              // 点検調書側にはこの列に相当するものが無いため施設台帳タブのみに置く。
              <SearchField
                key={`facName-${params.facName ?? ""}`}
                name="facName"
                label="施設名称"
                defaultValue={params.facName}
              />
            )}

            {cat === "inspection" ? (
              <>
                {/* --- 点検調書タブの分野。「災害」だけが実装済み（防災カルテ点検＝Karte）。 --- */}
                <div className="flex flex-wrap gap-1.5">
                  {INSPECTION_FIELDS.map((f) => (
                    <PendingLink
                      key={f.key}
                      href={inspectionFieldHref(f.key)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        inspectionBunya === f.key
                          ? "border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900"
                          : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {f.label}
                    </PendingLink>
                  ))}
                </div>
                {inspectionBunya === "disaster" ? (
                  <>
                    <SearchField
                      key={`routeNo-${params.routeNo ?? ""}`}
                      name="routeNo"
                      label="路線番号"
                      defaultValue={params.routeNo}
                    />
                    {/* 点検調書（災害＝Karte）には施設台帳のような「施設名称」列が
                        無いため、代わりに位置目印（landmark。現場の目印になる地名等）を
                        名前検索の対象にする（会話ログ「いずれも名前による検索が
                        できません」参照）。 */}
                    <SearchField
                      key={`landmark-${params.landmark ?? ""}`}
                      name="landmark"
                      label="位置目印"
                      defaultValue={params.landmark}
                    />
                    <div>
                      <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">災害区分</label>
                      <select
                        key={params.karteType ?? ""}
                        name="karteType"
                        defaultValue={params.karteType ?? ""}
                        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">すべて</option>
                        {Object.entries(KARTE_TYPE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">対応区分</label>
                      <select
                        key={params.responseCategory ?? ""}
                        name="responseCategory"
                        defaultValue={params.responseCategory ?? ""}
                        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">すべて</option>
                        {Object.entries(RESPONSE_META).map(([value, meta]) => (
                          <option key={value} value={value}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    {/* 「災害」以外の分野は、施設台帳と同じ形式で施設名称のドリルダウンを
                        もう1段持たせる（例: 道路→橋梁・トンネル・道路法面構造物等）。
                        FacilityInspectionRecordの横断検索（地図・共通フィールドでの絞り込み）
                        はまだ無いため、選んでも一覧・地図には反映されないが、道路＞門型標識
                        だけは実データがあるため、一覧ページへの案内を出す
                        （lib/actions/gate-sign-inspection-actions.ts参照。会話ログ
                        「門型標識のエクセルファイル...読み込んで表示できる仕様に」参照）。 */}
                    <div className="flex flex-wrap gap-1.5 border-l-2 border-gray-200 pl-2 dark:border-gray-700">
                      {INSPECTION_TYPES[inspectionBunya]?.map((t) => {
                        const isReady = inspectionBunya === "road" && t.label === "門型標識";
                        return (
                          <PendingLink
                            key={t.label}
                            href={inspectionShisetsuHref(inspectionBunya, t.label)}
                            className={`rounded-full border px-2 py-0.5 text-xs ${
                              inspectionShisetsu === t.label
                                ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500"
                                : isReady
                                  ? "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
                                  : "border-dashed border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600"
                            }`}
                          >
                            {t.label}
                            {!isReady && "（準備中）"}
                          </PendingLink>
                        );
                      })}
                    </div>
                    {inspectionBunya === "road" && inspectionShisetsu === "門型標識" ? (
                      <p className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        門型標識の点検調書 {mapGateSignInspections.length}件を地図に表示中です。
                        <Link href="/inspections/gate-signs" className="text-blue-600 dark:text-blue-400 hover:underline">
                          専用の一覧ページ
                        </Link>
                        で確認・
                        <Link href="/inspections/gate-signs/import" className="text-blue-600 dark:text-blue-400 hover:underline">
                          Excel取込
                        </Link>
                        もできます（施設台帳・地図の共通の検索条件（管理番号・路線名・所在地等）とは連動しません）。
                      </p>
                    ) : (
                      <p className="rounded border border-dashed border-gray-300 p-3 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
                        準備中です。この分野の点検調書はまだ登録されていません。
                      </p>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {/* --- 施設台帳タブの分野→施設名称ドリルダウン --- */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {FACILITY_LEDGER_ITEM_FIELDS.map((f) => (
                      <PendingLink
                        key={f.key}
                        href={facilityFieldHref(f.key)}
                        className={`rounded-full border px-2.5 py-1 text-xs ${
                          facilityBunya === f.key
                            ? "border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900"
                            : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {f.label}
                      </PendingLink>
                    ))}
                  </div>
                  {facilityBunya && (
                    <div className="flex flex-wrap gap-1.5 border-l-2 border-gray-200 pl-2 dark:border-gray-700">
                      {FACILITY_LEDGER_ITEM_TYPES[facilityBunya]?.map((t) => (
                        <PendingLink
                          key={t.label}
                          href={facilityShisetsuHref(facilityBunya, t.label)}
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            facilityShisetsu === t.label
                              ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500"
                              : t.match
                                ? "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
                                : "border-dashed border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600"
                          }`}
                        >
                          {t.label}
                          {!t.match && "（準備中）"}
                        </PendingLink>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">健全度</label>
                  <select
                    key={params.soundnessGrade ?? ""}
                    name="soundnessGrade"
                    defaultValue={params.soundnessGrade ?? ""}
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">すべて</option>
                    {soundnessGradeOptions.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="flex items-center gap-3 pt-1">
              <SearchSubmitButton
                type="submit"
                targetView={view}
                className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-1.5 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600"
              >
                検索
              </SearchSubmitButton>
              {cat === "inspection" && hasCondition && (
                <PendingLink href={clearKarteHref} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
                  条件をクリア
                </PendingLink>
              )}
              {cat === "facility" && hasFacCondition && (
                <PendingLink href={clearFacHref} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
                  条件をクリア
                </PendingLink>
              )}
            </div>
          </Form>
        )}

        {/* 表示中でない方のタブの検索状態も、地図には反映され続けるため、見落とさない
            ようにここで両系統の状況を常に表示する。 */}
        <p className="mt-2 space-y-0.5 text-xs text-gray-400 dark:text-gray-500">
          <span className="block">
            点検調書（災害）：
            {!hasSearched
              ? "未検索"
              : hasCondition
                ? `検索結果 ${kartes.length} 件`
                : `全 ${kartes.length} 件を地図に表示中`}
            {hasSearched && withoutCoordsCount > 0 && `（座標未登録 ${withoutCoordsCount} 件を除く）`}
          </span>
          <span className="block">
            施設台帳：
            {!hasFacSearched
              ? "未検索"
              : hasFacCondition
                ? `検索結果 ${facilityItems.length} 件`
                : `全 ${facilityItems.length} 件を地図に表示中`}
            {hasFacSearched && facWithoutCoordsCount > 0 && `（座標未登録 ${facWithoutCoordsCount} 件を除く）`}
          </span>
        </p>

        {cat === "inspection" && (
          <SearchHistoryPanel currentQuery={currentQueryString} currentLabel={currentSearchLabel} />
        )}
      </aside>

      <main className="relative flex-1 bg-gray-100 dark:bg-gray-950">
        {view === "list" ? (
          <div className="h-full space-y-6 overflow-y-auto p-4">
            <div>
              <h2 className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-200">点検調書（災害）検索結果</h2>
              <div className="overflow-x-auto rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-700 text-left text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="px-3 py-2"></th>
                      <th className="px-3 py-2">施設管理番号</th>
                      <th className="px-3 py-2">災害種別</th>
                      <th className="px-3 py-2">路線名</th>
                      <th className="px-3 py-2">所在地</th>
                      <th className="px-3 py-2">対象数</th>
                      <th className="px-3 py-2">最新点検日</th>
                      <th className="px-3 py-2">対応区分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kartes.map((k) => {
                      const resp = responseMeta(k.responseCategory);
                      return (
                        <tr key={k.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-3 py-2 text-yellow-500">{k.favorite ? "★" : ""}</td>
                          <td className="px-3 py-2">
                            <Link href={`/karte/${k.facilityNo}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                              {k.facilityNo}
                            </Link>
                          </td>
                          <td className="px-3 py-2">{KARTE_TYPE_LABEL[k.karteType] ?? k.karteType}</td>
                          <td className="px-3 py-2">{k.routeName}</td>
                          <td className="px-3 py-2">
                            {[k.locationDistrict, k.locationTown].filter(Boolean).join(" ")}
                          </td>
                          <td className="px-3 py-2">{k.targets.length}</td>
                          <td className="px-3 py-2">
                            {k.events[0]?.inspectionDate
                              ? new Date(k.events[0].inspectionDate).toLocaleDateString("ja-JP")
                              : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-2 py-0.5 text-xs ${resp.badgeColor}`}>{resp.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {kartes.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                          {!hasSearched ? (
                            "検索条件を指定して「検索」を押してください。"
                          ) : hasCondition ? (
                            "条件に一致する点検記録がありません。"
                          ) : (
                            <>データがありません。<code>npm run db:seed</code> でサンプルデータを投入してください。</>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-200">施設台帳 検索結果</h2>
              <div className="overflow-x-auto rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-700 text-left text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="px-3 py-2">管理番号</th>
                      <th className="px-3 py-2">管轄事務所</th>
                      <th className="px-3 py-2">路線名</th>
                      <th className="px-3 py-2">施設種別</th>
                      <th className="px-3 py-2">所在地</th>
                      <th className="px-3 py-2">健全度</th>
                      <th className="px-3 py-2">点検実施日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facilityItems.map((f) => (
                      <tr key={f.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-3 py-2">
                          <Link href={`/facility-list/${f.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {f.managementNo}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{f.officeName ?? "—"}</td>
                        <td className="px-3 py-2">{f.routeName ?? "—"}</td>
                        <td className="px-3 py-2">{formatFacilityType(f.facilityType, f.facilitySubType) ?? "—"}</td>
                        <td className="px-3 py-2">{f.location ?? "—"}</td>
                        <td className="px-3 py-2">{f.soundnessGrade ?? "—"}</td>
                        <td className="px-3 py-2">
                          {f.inspectionDate ? new Date(f.inspectionDate).toLocaleDateString("ja-JP") : "—"}
                        </td>
                      </tr>
                    ))}
                    {facilityItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                          {!hasFacSearched ? (
                            "検索条件を指定して「検索」を押してください。"
                          ) : (
                            "条件に一致する施設がありません。"
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                <Link href="/facility-list" className="text-blue-600 dark:text-blue-400 hover:underline">
                  施設台帳（全件）を見る →
                </Link>
              </p>
            </div>
          </div>
        ) : (
          <MapView
            kartes={mapKartes}
            home={home}
            allowSetHome
            ledgers={mapLedgers}
            facilityListItems={mapFacilityListItems}
            gateSignInspections={mapGateSignInspections}
          />
        )}
      </main>
    </div>
  );
}

// 分野→施設名称のドリルダウンUI（法令台帳タブ用。検索フォームを持たないタブの
// ための単純な表示コンポーネント。施設台帳・点検調書タブは検索フォームと一体の
// ため、こちらは使わずKarteListPage内に直接書いている）。
function FieldDrilldown({
  fields,
  types,
  selectedField,
  selectedType,
  fieldHref,
  typeHref,
  clearHref,
  renderSelection,
}: {
  fields: FieldDef[];
  types: Record<FieldKey, FacilityTypeDef[]>;
  selectedField: string | null;
  selectedType: string | null;
  fieldHref: (fieldKey: string) => string;
  typeHref: (fieldKey: string, label: string) => string;
  clearHref: string;
  renderSelection: (fieldKey: string, typeLabel: string) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <PendingLink
            key={f.key}
            href={fieldHref(f.key)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              selectedField === f.key
                ? "border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900"
                : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
            }`}
          >
            {f.label}
          </PendingLink>
        ))}
      </div>
      {selectedField && (
        <div className="flex flex-wrap gap-1.5 border-l-2 border-gray-200 pl-2 dark:border-gray-700">
          {types[selectedField]?.map((t) => (
            <PendingLink
              key={t.label}
              href={typeHref(selectedField, t.label)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                selectedType === t.label
                  ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500"
                  : t.match
                    ? "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
                    : "border-dashed border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600"
              }`}
            >
              {t.label}
              {!t.match && "（準備中）"}
            </PendingLink>
          ))}
        </div>
      )}
      {selectedField && selectedType && (
        <>
          {renderSelection(selectedField, selectedType)}
          <PendingLink href={clearHref} className="inline-block text-xs text-gray-400 hover:underline dark:text-gray-500">
            選択をクリア
          </PendingLink>
        </>
      )}
    </div>
  );
}

function SearchField({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{label}</label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
    </div>
  );
}
