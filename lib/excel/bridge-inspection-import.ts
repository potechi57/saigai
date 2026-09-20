import * as XLSX from "xlsx";
import type { WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";
import { extractSheetImages, type ExtractedImage } from "@/lib/excel/karte-image-extract";

// 点検調書＞道路＞橋梁のExcel取込（会話ログ「過去の門型標識点検のエクセル
// ファイルを参考に橋梁の点検様式の取り込みもできるようにしてほしい」参照。
// サンプルファイル「G57-AB-908913_01_富田橋.xlsx」で構造を確認済み）。
// 点検調書（門型標識＝lib/excel/gate-sign-inspection-import.ts）と同じ
// 「別紙２　様式１様式２」の発行元・様式体系の橋梁版。1ファイル＝1橋の
// 定期点検報告書で、32シート構成:
//   道路橋様式１・様式２、定期点検調書（その１〜その５。その４・その５は
//   径間の数だけシートが複製される）、損傷評価のまとめ、IMS設定シート。
// 詳細はprisma/schema.prismaのBridgeInspectionモデルのコメント参照
// （その４・損傷評価のまとめは、より詳細なその５と内容が重なる粗い総括表の
// ため取り込み対象外にしている。門型標識の様式１総括表を取り込まないのと
// 同じ判断）。
//
// 【管理番号について】その１シートの「橋梁番号」欄に実データがあるため、
// 門型標識（ファイル名から取得）と異なりExcel本体から直接取得できる。

function cellValue(ws: WorkSheet, r: number, c: number): string | number | Date | undefined {
  const addr = utils.encode_cell({ r, c });
  const cell = ws[addr];
  return cell?.v as string | number | Date | undefined;
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

function cellDate(ws: WorkSheet, r: number, c: number): Date | null {
  const val = cellValue(ws, r, c);
  if (val instanceof Date) return val;
  if (val === undefined || val === null || val === "") return null;
  const d = new Date(val as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

// IMS設定シート（非表示。項目名がA列、値がB列の縦持ち表）から、ラベル→値の
// マップを作る（gate-sign-inspection-import.tsのreadLabelValueMapと同じ方針）。
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

export type BridgeInspectionMemberData = {
  spanNo: number;
  pageNo: number;
  photoNo: number | null;
  memberName: string | null;
  memberDetail: string | null;
  damageType: string | null;
  findings: string | null;
  photo: ExtractedImage | null;
};

export type BridgeInspectionPhotoData = {
  image: ExtractedImage;
  caption: string | null;
};

// 「道路橋様式１」の「部材単位の診断（各部材毎に最悪値を記入）」総括表
// （主桁・横桁・床版・下部構造・支承部・その他の6行固定。実データ確認済み:
// A/B列=部材名、C列=判定区分、D列=変状の種類、F列=備考、H列=応急措置後の
// 判定区分、J列=応急措置内容、L列=応急措置及び判定実施年月日）。
// GateSignInspectionMemberOverviewRowと同じ形。橋全体を通した1つだけの
// 総合評価であり、BridgeInspection.memberOverviewにJSONとして保存する
// （schema.prismaのBridgeInspection.memberOverviewコメント参照）。
export type BridgeInspectionMemberOverviewRow = {
  memberName: string;
  judgment: string | null;
  damageType: string | null;
  remarks: string | null;
  postActionJudgment: string | null;
  postActionContent: string | null;
  postActionDate: string | null;
};

// 「定期点検調書（その４）径間N」の径間ごとの損傷評価（床版・主桁・横桁・
// 橋台橋脚・支承・排水施設・伸縮装置・高欄地覆・路面の9項目固定。実データ
// 確認済み: V列=部材名、X列=判定区分、Y列=変状の種類）。径間の数だけ配列
// 要素を持つ（schema.prismaのBridgeInspection.spanDiagnosesコメント参照）。
export type BridgeInspectionSpanDiagnosisItem = {
  memberName: string;
  judgment: string | null;
  damageType: string | null;
};
export type BridgeInspectionSpanDiagnosis = {
  spanNo: number;
  items: BridgeInspectionSpanDiagnosisItem[];
};

export type BridgeInspectionData = {
  managementNo: string | null;
  bridgeName: string | null;
  bridgeNameKana: string | null;
  routeName: string | null;
  location: string | null;
  officeName: string | null;
  spanCount: number | null;
  latitude: number | null;
  longitude: number | null;
  inspectionDate: Date | null;
  inspectorCompany: string | null;
  responsiblePerson: string | null;
  overallJudgment: string | null;
  overallFindings: string | null;
  memberOverview: BridgeInspectionMemberOverviewRow[];
  spanDiagnoses: BridgeInspectionSpanDiagnosis[];
  members: BridgeInspectionMemberData[];
  photos: BridgeInspectionPhotoData[];
};

// 【シート名の数字が半角であることについて】門型標識の点検調書（様式（その１）等）
// は全角数字だが、橋梁の点検調書は実データ（G57-AB-908913_01_富田橋.xlsx）で
// 確認したところ半角数字（道路橋様式1P001・定期点検調書（その1）等。末尾の
// 「P001」はおそらく発行システム側のページ番号で、内容には使わない）だった。
// 発行元・様式体系は門型標識と同じだが、この点は表記が異なるため、
// gate-sign-inspection-import.tsの全角パターンをそのまま流用しない。
const FORM1_SHEET_NAME = "道路橋様式1";
const FORM2_SHEET_NAME = "道路橋様式2";
const SPEC_SHEET_NAME = "定期点検調書（その1）";
const DRAWING_SHEET_NAME = "定期点検調書（その2）";
const SITE_PHOTO_SHEET_NAME = "定期点検調書（その3）";
// 「定期点検調書（その5）」N_径間M（Nは1〜4程度、損傷箇所の数に応じて複製）。
// 実データでは末尾に余分な空白が付くことがある（例:「...径間4 」）ため、
// 前方一致（trimして比較）で拾う。
const DAMAGE_PHOTO_SHEET_PREFIX = "定期点検調書（その5）";
// 「定期点検調書（その4） 径間N」（径間の数だけ複製される。その5と同じく
// 末尾の空白ゆれに備え前方一致で拾う）。
const SPAN_DIAGNOSIS_SHEET_PREFIX = "定期点検調書（その4）";

// シート名がテンプレートの全角数字（Ａ／１等）表記か、通常の全角文字表記か
// ファイルによってブレる可能性があるため、前方一致・trimで緩く探す
// （gate-sign-inspection-import.tsのFORM2_SHEET_PREFIX探索と同じ考え方）。
function findSheet(wb: WorkBook, name: string): WorkSheet | null {
  const exact = wb.SheetNames.find((n) => n.trim() === name);
  if (exact) return wb.Sheets[exact];
  const prefixed = wb.SheetNames.find((n) => n.trim().startsWith(name));
  return prefixed ? wb.Sheets[prefixed] : null;
}

function extractSpec(ws: WorkSheet): Pick<
  BridgeInspectionData,
  | "managementNo"
  | "bridgeNameKana"
  | "bridgeName"
  | "officeName"
  | "location"
  | "routeName"
  | "inspectorCompany"
  | "responsiblePerson"
  | "spanCount"
  | "inspectionDate"
> {
  return {
    managementNo: cellText(ws, 3, 3), // D4
    spanCount: cellNumber(ws, 3, 6), // G4
    officeName: cellText(ws, 3, 10), // K4
    inspectorCompany: cellText(ws, 3, 15), // P4
    bridgeNameKana: cellText(ws, 4, 3), // D5
    location: cellText(ws, 4, 10), // K5
    responsiblePerson: cellText(ws, 4, 15), // P5
    bridgeName: cellText(ws, 5, 3), // D6
    routeName: cellText(ws, 5, 15), // P6
    inspectionDate: cellDate(ws, 1, 15), // P2
  };
}

function extractOverallJudgment(ws: WorkSheet): { overallJudgment: string | null; overallFindings: string | null } {
  // 「道路橋毎の健全性の診断」欄。ヘッダー（（判定区分）（所見等）」の
  // 次の行に実際の値が入る（実データで確認済み。A24/B24=ヘッダー、A25/B25=値）。
  return { overallJudgment: cellText(ws, 24, 0), overallFindings: cellText(ws, 24, 1) };
}

// 「部材単位の診断」総括表は、部材名（A列）が無い行は直前の部材グループの
// 続き（例:「上部構造」グループの主桁・横桁・床版）であることを実データで
// 確認済み。表示上は部材名（B列があればB列、無ければA列）をそのまま使う。
const MEMBER_OVERVIEW_ROWS = [
  { row: 14, nameCol: 1, defaultName: "主桁" },
  { row: 15, nameCol: 1, defaultName: "横桁" },
  { row: 16, nameCol: 1, defaultName: "床版" },
  { row: 17, nameCol: 0, defaultName: "下部構造" },
  { row: 18, nameCol: 0, defaultName: "支承部" },
  { row: 19, nameCol: 0, defaultName: "その他" },
] as const;

function extractMemberOverview(ws: WorkSheet): BridgeInspectionMemberOverviewRow[] {
  return MEMBER_OVERVIEW_ROWS.map(({ row, nameCol, defaultName }) => ({
    memberName: cellText(ws, row, nameCol) ?? defaultName,
    judgment: cellText(ws, row, 2),
    damageType: cellText(ws, row, 3),
    remarks: cellText(ws, row, 5),
    postActionJudgment: cellText(ws, row, 7),
    postActionContent: cellText(ws, row, 9),
    postActionDate: cellText(ws, row, 11),
  }));
}

// 「定期点検調書（その４）径間N」1枚分（V列=部材名、X列=判定区分、Y列=変状の
// 種類、行8〜16固定。実データ確認済み）。
const SPAN_DIAGNOSIS_ROWS = 9; // 床版・主桁・横桁・橋台橋脚・支承・排水施設・伸縮装置・高欄地覆・路面
function extractSpanDiagnosisItems(ws: WorkSheet): BridgeInspectionSpanDiagnosisItem[] {
  const items: BridgeInspectionSpanDiagnosisItem[] = [];
  for (let i = 0; i < SPAN_DIAGNOSIS_ROWS; i++) {
    const row = 7 + i;
    const memberName = cellText(ws, row, 21);
    if (!memberName) continue;
    items.push({
      memberName,
      judgment: cellText(ws, row, 23),
      damageType: cellText(ws, row, 24),
    });
  }
  return items;
}

// 様式２・その２・その３の「写真の1行上・同じ列」に置かれたラベルセルを
// キャプションとして拾う（実データで確認済みの配置。厳密に同じ列でない
// ファイルにも備え、近傍を軽く探索する）。
function findNearbyCaption(ws: WorkSheet, imageFromRow: number, imageFromCol: number): string | null {
  for (const rowOffset of [-1, -2]) {
    for (const colOffset of [0, -1, 1, -2, 2]) {
      const text = cellText(ws, imageFromRow + rowOffset, imageFromCol + colOffset);
      if (text) return text;
    }
  }
  return null;
}

async function extractLabeledPhotos(buffer: Buffer, sheetName: string, ws: WorkSheet): Promise<BridgeInspectionPhotoData[]> {
  const images = await extractSheetImages(buffer, sheetName);
  const sorted = [...images].sort((a, b) => a.fromRow - b.fromRow || a.fromCol - b.fromCol);
  return sorted.map((image) => ({ image, caption: findNearbyCaption(ws, image.fromRow, image.fromCol) }));
}

// その５（N_径間M）シート1枚から、損傷箇所ごとのカード（最大4枚。左上・右上・
// 左下・右下の2×2配置）を抜き出す。カードは「写真番号」ラベルを起点に、
// 同じ行・値列オフセット+3に各項目の値が入るが、「コメント※必記」欄だけは
// 例外的に「ラベルの1行下・同じ列」に実際のコメント本文が入る（実データで
// 確認済み。gate-sign-inspection-import.tsのカードと違うレイアウトのため、
// この関数だけ専用の抽出ロジックにしている）。
const CARD_VALUE_COL_OFFSET = 3;
const CARD_ROW_OFFSET = {
  photoNo: 0,
  memberName: 1,
  memberDetail: 2,
  damageType: 3,
  findingsLabel: 5,
} as const;

type RawCard = {
  row: number;
  col: number;
  photoNo: number | null;
  memberName: string | null;
  memberDetail: string | null;
  damageType: string | null;
  findings: string | null;
  hasPhoto: boolean;
};

function extractDamageCards(ws: WorkSheet, maxRow = 80): RawCard[] {
  const cards: RawCard[] = [];
  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= 60; c++) {
      if (cellText(ws, r, c) !== "写真番号") continue;
      const valueCol = c + CARD_VALUE_COL_OFFSET;
      const photoNoText = cellText(ws, r + CARD_ROW_OFFSET.photoNo, valueCol);
      const photoNo = photoNoText ? Number(photoNoText) : null;
      const findingsLabelRow = r + CARD_ROW_OFFSET.findingsLabel;
      const card: RawCard = {
        row: r,
        col: c,
        photoNo: Number.isFinite(photoNo) ? photoNo : null,
        memberName: cellText(ws, r + CARD_ROW_OFFSET.memberName, valueCol),
        memberDetail: cellText(ws, r + CARD_ROW_OFFSET.memberDetail, valueCol),
        damageType: cellText(ws, r + CARD_ROW_OFFSET.damageType, valueCol),
        // コメント本文はラベル（findingsLabelRow・c列）の1行下・同じ列。
        findings: cellText(ws, findingsLabelRow + 1, c),
        hasPhoto: photoNoText !== null,
      };
      const hasAnyContent = card.photoNo != null || card.memberName || card.damageType || card.findings;
      if (!hasAnyContent) continue;
      cards.push(card);
    }
  }
  return cards;
}

async function extractMembersFromSheet(
  buffer: Buffer,
  sheetName: string,
  ws: WorkSheet,
  spanNo: number,
  pageNo: number
): Promise<BridgeInspectionMemberData[]> {
  const cards = extractDamageCards(ws);
  const images = await extractSheetImages(buffer, sheetName);
  // カードは2×2（左上・右上・左下・右下）で、写真も同じ並び順で埋め込まれている
  // ことを実データで確認済み（行→列の順でソートすると自然に対応する）。
  const sortedCards = [...cards].sort((a, b) => a.row - b.row || a.col - b.col);
  const sortedImages = [...images].sort((a, b) => a.fromRow - b.fromRow || a.fromCol - b.fromCol);

  let imageIndex = 0;
  return sortedCards.map((card) => {
    const photo = card.hasPhoto ? (sortedImages[imageIndex++] ?? null) : null;
    return {
      spanNo,
      pageNo,
      photoNo: card.photoNo,
      memberName: card.memberName,
      memberDetail: card.memberDetail,
      damageType: card.damageType,
      findings: card.findings,
      photo,
    };
  });
}

// 「定期点検調書（その５）」シートの「径間番号」欄（実データで確認済み:
// L4ラベル・N4に値）から径間番号を読み取る。シート名（...N_径間M）の解析にも
// 頼れるが、末尾の空白等の表記ゆれ（実データで確認済み）に影響されない
// セル値を優先する。
function readSpanNo(ws: WorkSheet): number | null {
  return cellNumber(ws, 3, 13); // N4
}

// 「定期点検調書（その４）径間N」シートの「径間番号」欄（実データ確認済み:
// J4ラベル・K4に値。その５とはラベル・値のセル位置が異なる点に注意）。
function readSpanDiagnosisSpanNo(ws: WorkSheet): number | null {
  return cellNumber(ws, 3, 10); // K4
}

export async function parseBridgeInspectionExcel(buffer: Buffer, fileName: string): Promise<BridgeInspectionData | null> {
  const wb: WorkBook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const specSheet = findSheet(wb, SPEC_SHEET_NAME);
  const form1Sheet = findSheet(wb, FORM1_SHEET_NAME);
  if (!specSheet || !form1Sheet) return null;

  const spec = extractSpec(specSheet);
  const overall = extractOverallJudgment(form1Sheet);
  const memberOverview = extractMemberOverview(form1Sheet);

  const imsSheet = findSheet(wb, "IMS設定シート");
  const imsMap = imsSheet ? readLabelValueMap(imsSheet) : new Map<string, string>();
  const latitude = dmsFromMap(imsMap, "緯度(度)", "緯度(分)", "緯度(秒)");
  const longitude = dmsFromMap(imsMap, "経度(度)", "経度(分)", "経度(秒)");

  const photos: BridgeInspectionPhotoData[] = [];
  const form2Sheet = findSheet(wb, FORM2_SHEET_NAME);
  if (form2Sheet) {
    const name = wb.SheetNames.find((n) => wb.Sheets[n] === form2Sheet)!;
    photos.push(...(await extractLabeledPhotos(buffer, name, form2Sheet)));
  }
  const drawingSheet = findSheet(wb, DRAWING_SHEET_NAME);
  if (drawingSheet) {
    const name = wb.SheetNames.find((n) => wb.Sheets[n] === drawingSheet)!;
    photos.push(...(await extractLabeledPhotos(buffer, name, drawingSheet)));
  }
  const sitePhotoSheet = findSheet(wb, SITE_PHOTO_SHEET_NAME);
  if (sitePhotoSheet) {
    const name = wb.SheetNames.find((n) => wb.Sheets[n] === sitePhotoSheet)!;
    photos.push(...(await extractLabeledPhotos(buffer, name, sitePhotoSheet)));
  }

  // 「定期点検調書（その５）」N_径間M シート群。径間ごとに何枚シートが
  // 複製されているかはファイルによって異なるため、名前ではなく登場順で
  // 数え、径間番号はシート自身のセル値から読む（上記readSpanNo参照）。
  const damageSheetNames = wb.SheetNames.filter((n) => n.trim().startsWith(DAMAGE_PHOTO_SHEET_PREFIX));
  const members: BridgeInspectionMemberData[] = [];
  const pageNoBySpan = new Map<number, number>();
  for (const sheetName of damageSheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const spanNo = readSpanNo(ws);
    if (spanNo == null) continue;
    const pageNo = (pageNoBySpan.get(spanNo) ?? 0) + 1;
    pageNoBySpan.set(spanNo, pageNo);
    members.push(...(await extractMembersFromSheet(buffer, sheetName, ws, spanNo, pageNo)));
  }

  // 「定期点検調書（その４）」径間N シート群（径間ごとの損傷評価。
  // schema.prismaのBridgeInspection.spanDiagnosesコメント参照）。
  const spanDiagnosisSheetNames = wb.SheetNames.filter((n) => n.trim().startsWith(SPAN_DIAGNOSIS_SHEET_PREFIX));
  const spanDiagnoses: BridgeInspectionSpanDiagnosis[] = [];
  for (const sheetName of spanDiagnosisSheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const spanNo = readSpanDiagnosisSpanNo(ws);
    if (spanNo == null) continue;
    spanDiagnoses.push({ spanNo, items: extractSpanDiagnosisItems(ws) });
  }
  spanDiagnoses.sort((a, b) => a.spanNo - b.spanNo);

  return {
    ...spec,
    latitude,
    longitude,
    ...overall,
    memberOverview,
    spanDiagnoses,
    members,
    photos,
  };
}

export { parseBridgeInspectionExcel as default };
