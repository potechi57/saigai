import * as XLSX from "xlsx";
import type { WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";
import { extractSheetImages, type ExtractedImage } from "@/lib/excel/karte-image-extract";

// 点検調書＞道路＞門型標識のExcel取込（会話ログ「別紙２　様式１様式２」参照）。
// 島根県の「道路土工構造物等定期点検要領」系の様式で、1施設1ファイルの詳細な
// 点検報告書。5シート構成: 様式（その１）＝基本情報・部材単位の総括、
// 様式（その２）（同名でExcel上は2・3と連番が付く）＝損傷箇所ごとの写真付き
// 詳細カード、IMS設定シート（非表示）＝市町村・緯度経度・点検年月日等の
// 構造化済みデータ。
//
// 【セル位置について】karte-import.tsと同じ方針で、固定セル位置を直接指定する
// （このExcelはテンプレートに直接記入する運用のため、様式Ａ〜Ｄ同様セル位置が
// ファイルによってずれない前提）。様式（その１）の部材単位の総括表（5行）は、
// 様式（その２）の詳細カードと内容が重なりより粗い情報だが、様式１タブは
// 概要表示という位置づけのため、GateSignInspection.memberOverview（JSON）として
// 別途取り込む（会話ログ「様式1は概要を表示するという観点で部材ごとの健全性の
// 診断も表示してほしい」参照。様式（その２）のカードは従来どおり部材レコードとして
// 保存する。詳細情報の入力元はどちらも同じ点検結果のため、値自体は重複する）。
//
// 【施設名・管理番号について】Excel内の「管理番号」セルは空欄のことが多いため、
// 呼び出し側でファイル名（例:「A01-AE-010474_01_松江島根線_...xlsx」の先頭）から
// 取得する（parseManagementNoFromFileName参照）。

function cellValue(ws: WorkSheet, r: number, c: number): string | number | undefined {
  const addr = utils.encode_cell({ r, c });
  const cell = ws[addr];
  return cell?.v as string | number | undefined;
}

function cellText(ws: WorkSheet, r: number, c: number): string | null {
  const val = cellValue(ws, r, c);
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

function cellNumber(ws: WorkSheet, r: number, c: number): number | null {
  const val = cellValue(ws, r, c);
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

// "1993年"→1993、"3月"→3のように、末尾の単位漢字を取り除いた数値を返す。
function numberBeforeUnit(ws: WorkSheet, r: number, c: number): number | null {
  const text = cellText(ws, r, c);
  if (!text) return null;
  const n = Number(text.replace(/[年月日]$/, ""));
  return Number.isFinite(n) ? n : null;
}

// ファイル名の先頭にある管理番号（例:「A01-AE-010474」）を取り出す。
// 施設台帳（FacilityListItem.managementNo）と同じ書式（英数字-英数字-数字）を
// 想定している。一致しない場合はnull（呼び出し側で未紐付けのまま保存する）。
export function parseManagementNoFromFileName(fileName: string): string | null {
  const m = fileName.match(/^([A-Za-z0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+)_/);
  return m ? m[1] : null;
}

// IMS設定シート（非表示。項目名がA列、値がB列の縦持ち表）から、ラベル→値の
// マップを作る。行位置に依存せずラベル文字列で引けるようにするため
// （このシートは自動生成ツール由来で、項目の並び順が変わる可能性を考慮）。
function readLabelValueMap(ws: WorkSheet, maxRow = 40): Map<string, string> {
  const map = new Map<string, string>();
  for (let r = 0; r <= maxRow; r++) {
    const label = cellText(ws, r, 0);
    if (!label) continue;
    const value = cellText(ws, r, 1);
    if (value !== null) map.set(label, value);
  }
  return map;
}

function dmsFromMap(map: Map<string, string>, degKey: string, minKey: string, secKey: string): number | null {
  const deg = Number(map.get(degKey));
  const min = Number(map.get(minKey));
  const sec = Number(map.get(secKey));
  if (!Number.isFinite(deg) && !Number.isFinite(min) && !Number.isFinite(sec)) return null;
  return (Number.isFinite(deg) ? deg : 0) + (Number.isFinite(min) ? min : 0) / 60 + (Number.isFinite(sec) ? sec : 0) / 3600;
}

export type GateSignInspectionMemberData = {
  // 元Excelの「状況写真（損傷状況）」シート（様式（その２）／様式（その２）2／
  // 様式（その２）3…）のうち、何枚目のシート由来かを1始まりで表す
  // （会話ログ「状況写真のタブを３つ作ってください」参照。詳細画面でシートごとの
  // タブに分けて表示するために使う）。
  pageNo: number;
  photoNo: number | null;
  memberName: string | null;
  memberDetail: string | null;
  damageType: string | null;
  judgment: string | null;
  postActionJudgment: string | null;
  postActionContent: string | null;
  findings: string | null;
  remarks: string | null;
  photo: ExtractedImage | null;
};

export type GateSignInspectionOverviewPhoto = {
  image: ExtractedImage;
  caption: string | null;
};

// 様式（その１）の「部材単位の健全性の診断」総括表（行16〜20固定。実データで
// セル位置確認済み: A列=部材等、F列=判定区分、G:I列=変状の種類、J:L列=備考、
// M列=応急措置後の判定区分、N:O列=応急措置内容、P:R列=応急措置及び判定実施年月日）。
// GateSignInspection.memberOverviewにJSONとしてそのまま保存する（schema.prisma
// のGateSignInspection.memberOverviewコメント参照）。
export type GateSignInspectionMemberOverviewRow = {
  memberName: string;
  judgment: string | null;
  damageType: string | null;
  remarks: string | null;
  postActionJudgment: string | null;
  postActionContent: string | null;
  postActionDate: string | null;
};

export type GateSignInspectionData = {
  managementNo: string | null;
  facilityName: string | null;
  facilityForm: string | null;
  routeName: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  inspectionDate: Date | null;
  inspectorCompany: string | null;
  inspectorName: string | null;
  managerOrgName: string | null;
  hasAlternateRoute: string | null;
  emergencyTransportRoad: string | null;
  roadCategory: string | null;
  occupyingObjects: string | null;
  installedYear: number | null;
  installedMonth: number | null;
  roadWidthM: number | null;
  structureType: string | null;
  overallJudgment: string | null;
  overallFindings: string | null;
  memberOverview: GateSignInspectionMemberOverviewRow[];
  members: GateSignInspectionMemberData[];
  overviewPhotos: GateSignInspectionOverviewPhoto[];
};

const FORM1_SHEET_NAME = "様式（その１）";
// 様式（その２）はExcel上、複製されるたびに「様式（その２）」「様式（その２）2」
// 「様式（その２）3」…と連番が付く（重複シート名を許さないExcelの仕様のため）。
// 損傷箇所の数に応じて枚数が変わりうるため、名前を固定せず前方一致で拾う。
const FORM2_SHEET_PREFIX = "様式（その２）";

// 様式（その２）内、1枚の写真カードの相対セル位置（カード左上を(0,0)とする）。
// 左カード=列オフセット0、右カード=列オフセット13（実データで確認済み）。
const CARD_FIELD_ROW_OFFSET = {
  photoNo: 0,
  memberName: 1,
  memberDetail: 2,
  damageType: 3,
  judgment: 4,
  postActionJudgment: 5,
  postActionContent: 6,
  findings: 7,
  remarks: 8,
} as const;
const CARD_VALUE_COL_OFFSET = 3; // ラベル列(0)に対する値列のオフセット
const CARD_COL_STARTS = [0, 13] as const;

function extractForm1(ws: WorkSheet): Pick<
  GateSignInspectionData,
  | "facilityName"
  | "facilityForm"
  | "routeName"
  | "location"
  | "inspectorCompany"
  | "inspectorName"
  | "managerOrgName"
  | "hasAlternateRoute"
  | "emergencyTransportRoad"
  | "roadCategory"
  | "occupyingObjects"
  | "installedYear"
  | "installedMonth"
  | "roadWidthM"
  | "structureType"
  | "overallJudgment"
  | "overallFindings"
  | "inspectionDate"
> {
  const year = cellNumber(ws, 7, 9);
  const month = cellNumber(ws, 7, 10);
  const day = cellNumber(ws, 7, 11);
  const inspectionDate = year && month && day ? new Date(Date.UTC(year, month - 1, day)) : null;

  return {
    facilityName: cellText(ws, 5, 0),
    facilityForm: cellText(ws, 5, 3),
    routeName: cellText(ws, 5, 6),
    location: cellText(ws, 5, 9),
    inspectionDate,
    inspectorCompany: cellText(ws, 7, 13),
    inspectorName: cellText(ws, 7, 16),
    managerOrgName: cellText(ws, 8, 0),
    hasAlternateRoute: cellText(ws, 10, 0),
    emergencyTransportRoad: cellText(ws, 10, 2),
    roadCategory: cellText(ws, 10, 6),
    occupyingObjects: cellText(ws, 10, 9),
    installedYear: numberBeforeUnit(ws, 28, 0),
    installedMonth: numberBeforeUnit(ws, 28, 1),
    roadWidthM: cellNumber(ws, 28, 2),
    structureType: cellText(ws, 30, 0),
    overallJudgment: cellText(ws, 24, 0),
    overallFindings: cellText(ws, 24, 2),
  };
}

const MEMBER_OVERVIEW_ROWS = [
  { row: 15, defaultName: "支柱" },
  { row: 16, defaultName: "横梁" },
  { row: 17, defaultName: "標識板または道路情報板" },
  { row: 18, defaultName: "基礎" },
  { row: 19, defaultName: "その他" },
] as const;

function extractMemberOverview(ws: WorkSheet): GateSignInspectionMemberOverviewRow[] {
  return MEMBER_OVERVIEW_ROWS.map(({ row, defaultName }) => ({
    memberName: cellText(ws, row, 0) ?? defaultName,
    judgment: cellText(ws, row, 5),
    damageType: cellText(ws, row, 6),
    remarks: cellText(ws, row, 9),
    postActionJudgment: cellText(ws, row, 12),
    postActionContent: cellText(ws, row, 13),
    postActionDate: cellText(ws, row, 15),
  }));
}

async function extractForm1OverviewPhotos(buffer: Buffer): Promise<GateSignInspectionOverviewPhoto[]> {
  const images = await extractSheetImages(buffer, FORM1_SHEET_NAME);
  // 起点側（列が小さい）→終点側（列が大きい）の順に並べる（実データで確認済み。
  // extractSheetImages自体も列→行の順で返すが、ここでは明示的に指定する）。
  const sorted = [...images].sort((a, b) => a.fromCol - b.fromCol || a.fromRow - b.fromRow);
  const captions = ["起点側", "終点側"];
  return sorted.map((image, i) => ({ image, caption: captions[i] ?? null }));
}

type RawCard = GateSignInspectionMemberData & { row: number; hasPhoto: boolean };

function extractCardsFromSheet(ws: WorkSheet, pageNo: number, maxRow = 200): RawCard[] {
  const cards: RawCard[] = [];
  for (let r = 0; r <= maxRow; r++) {
    for (const colStart of CARD_COL_STARTS) {
      if (cellText(ws, r, colStart) !== "写真番号") continue;
      const valueCol = colStart + CARD_VALUE_COL_OFFSET;
      const get = (offset: number) => cellText(ws, r + offset, valueCol);
      const photoNoText = get(CARD_FIELD_ROW_OFFSET.photoNo);
      const photoNo = photoNoText ? Number(photoNoText) : null;
      const card: RawCard = {
        row: r,
        pageNo,
        photoNo: Number.isFinite(photoNo) ? photoNo : null,
        memberName: get(CARD_FIELD_ROW_OFFSET.memberName),
        memberDetail: get(CARD_FIELD_ROW_OFFSET.memberDetail),
        damageType: get(CARD_FIELD_ROW_OFFSET.damageType),
        judgment: get(CARD_FIELD_ROW_OFFSET.judgment),
        postActionJudgment: get(CARD_FIELD_ROW_OFFSET.postActionJudgment),
        postActionContent: get(CARD_FIELD_ROW_OFFSET.postActionContent),
        findings: get(CARD_FIELD_ROW_OFFSET.findings),
        remarks: get(CARD_FIELD_ROW_OFFSET.remarks),
        photo: null,
        hasPhoto: photoNoText !== null,
      };
      // 写真番号すら無い（＝未記入の空きカード枠）は取り込まない。
      const hasAnyContent =
        card.photoNo != null || card.memberName || card.damageType || card.judgment || card.findings;
      if (!hasAnyContent) continue;
      cards.push(card);
    }
  }
  return cards;
}

async function extractMembersFromSheet(buffer: Buffer, sheetName: string, ws: WorkSheet, pageNo: number): Promise<GateSignInspectionMemberData[]> {
  const cards = extractCardsFromSheet(ws, pageNo);
  const images = await extractSheetImages(buffer, sheetName);
  const sortedImages = [...images].sort((a, b) => a.fromRow - b.fromRow || a.fromCol - b.fromCol);

  let imageIndex = 0;
  for (const card of cards) {
    if (!card.hasPhoto) continue;
    card.photo = sortedImages[imageIndex] ?? null;
    imageIndex++;
  }
  return cards.map(({ row: _row, hasPhoto: _hasPhoto, ...rest }) => rest);
}

// ワークブック全体から点検調書1件分のデータを組み立てる。様式（その１）が
// 見つからない場合（想定外の形式のファイル）はnullを返す。
export async function parseGateSignInspectionExcel(buffer: Buffer, fileName: string): Promise<GateSignInspectionData | null> {
  const wb: WorkBook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const form1Sheet = wb.Sheets[FORM1_SHEET_NAME];
  if (!form1Sheet) return null;

  const form1Fields = extractForm1(form1Sheet);
  const memberOverview = extractMemberOverview(form1Sheet);
  const overviewPhotos = await extractForm1OverviewPhotos(buffer);

  const imsSheet = wb.Sheets["IMS設定シート"];
  const imsMap = imsSheet ? readLabelValueMap(imsSheet) : new Map<string, string>();
  const latitude = dmsFromMap(imsMap, "緯度(度)", "緯度(分)", "緯度(秒)");
  const longitude = dmsFromMap(imsMap, "経度(度)", "経度(分)", "経度(秒)");

  // 「様式（その２）」「様式（その２）2」「様式（その２）3」…はExcel上、シート名の
  // 末尾に何も付かないもの→連番、という順で複製される（重複シート名を許さない
  // Excelの仕様のため）。SheetNamesの登場順がそのままページ順になる
  // （実データで確認済み）。
  const form2SheetNames = wb.SheetNames.filter((name) => name.startsWith(FORM2_SHEET_PREFIX));
  const members: GateSignInspectionMemberData[] = [];
  for (let i = 0; i < form2SheetNames.length; i++) {
    const sheetName = form2SheetNames[i];
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    members.push(...(await extractMembersFromSheet(buffer, sheetName, ws, i + 1)));
  }

  return {
    managementNo: parseManagementNoFromFileName(fileName),
    ...form1Fields,
    latitude,
    longitude,
    memberOverview,
    members,
    overviewPhotos,
  };
}
