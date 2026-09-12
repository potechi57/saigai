import type { WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";

// 「施設一覧」形式のExcel（道路施設の管理台帳の出力）を取り込むためのパーサー。
// 実データ「施設一覧(道路法面施設).xlsx」「施設一覧.xlsx」（門型標識）の2件で
// 列構造が一致することを確認済み。施設種別（列7）は「道路法面施設」「道路附属物」
// 等の大分類、施設細別（列8）は「道路標識（門型）」等のより具体的な種類を持つ
// （施設種別と同じ値が入っている行もある。表示側の扱いはlib/labels.ts
// formatFacilityType()参照）。
//
// 防災カルテ（karte-import.ts）の様式Excelとは全く別の形式・目的のデータで、
// 1シートに多数の施設が一覧形式で並ぶ「施設管理台帳」の出力そのもの。
// カルテのような様式Ａ〜Ｄの詳細記録は無く、施設の基本情報＋直近点検の要約
// （健全度・点検日・所見）だけを持つ、より軽量なデータ。そのためKarteモデル
// には取り込まず、専用のFacilityListItemモデルに取り込む
// （prisma/schema.prisma参照）。
//
// 【実データで確認した構造】
// - 1行目: タイトル（「■施設一覧」等）。2行目: 空行。
// - 3〜4行目: 2段構成のヘッダー。「管理番号」等の単独項目は3〜4行目を
//   縦結合した1セル、「法令台帳」「施設台帳」「点検記録」「修繕記録」は
//   3行目に横結合の大区分、4行目にその内訳（名称／作成・更新 等）。
// - 5行目以降: データ行（管理番号が空になったら終端とみなす）。
// 列位置はこの実データで確認済みの固定位置としている。想定と異なるファイル
// （「管理番号」ヘッダーが無い等）はfindFacilityListSheetNameがnullを返す。

export type ExtractedFacilityListItem = {
  managementNo: string;
  oldManagementNo: string | null;
  officeName: string | null;
  facilityField: string | null;
  routeType: string | null;
  routeName: string | null;
  facilityType: string | null;
  facilitySubType: string | null;
  facilityName: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  constructionYear: string | null;
  remarks: string | null;
  regulationLedgerName: string | null;
  regulationLedgerUpdatedAt: string | null;
  facilityLedgerName: string | null;
  facilityLedgerUpdatedAt: string | null;
  inspectionType: string | null;
  soundnessGrade: string | null;
  inspectionDate: Date | null;
  inspector: string | null;
  mainFindings: string | null;
  repairDate: string | null;
  repairRemarks: string | null;
};

const HEADER_ROW = 2; // 0-indexed（Excel上の3行目）。「管理番号」が入る行
const DATA_START_ROW = 4; // 0-indexed（Excel上の5行目）

// 列位置（0-indexed）。実データ「施設一覧(道路法面施設).xlsx」で確認済み。
const COL = {
  managementNo: 1,
  oldManagementNo: 2,
  officeName: 3,
  facilityField: 4,
  routeType: 5,
  routeName: 6,
  facilityType: 7,
  facilitySubType: 8,
  facilityName: 9,
  location: 10,
  latLng: 11,
  constructionYear: 12,
  remarks: 13,
  regulationLedgerName: 14,
  regulationLedgerUpdatedAt: 15,
  facilityLedgerName: 16,
  facilityLedgerUpdatedAt: 17,
  inspectionType: 18,
  soundnessGrade: 19,
  inspectionDate: 20,
  inspector: 21,
  mainFindings: 22,
  repairDate: 23,
  repairRemarks: 24,
} as const;

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

// "35.48818889,133.0831861" のようなカンマ区切りの緯度経度を分解する。
function parseLatLng(text: string | null): { latitude: number | null; longitude: number | null } {
  if (!text) return { latitude: null, longitude: null };
  const parts = text.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    return { latitude: null, longitude: null };
  }
  return { latitude: parts[0], longitude: parts[1] };
}

// "2016/04/01" 等の日付。cellDates:trueで読み込んだ場合はセルの値が既にDate型に
// なっていることが多いのでそれを優先し、そうでなければ文字列からパースする。
// どちらの経路でも、最終的にはUTC正午…ではなくUTC 0時（日付のみ、時刻情報は
// 捨てる）に正規化する。これは、施設一覧の再取込時にFacilityInspectionRecordの
// 一意キー（施設×点検日）として使うため（lib/actions/facility-list-actions.ts
// 参照）で、経路によって時刻・タイムゾーンの解釈が異なると（xlsxのcellDates変換は
// UTC基準、new Date(text)はロケールのローカル時刻基準）、同じ論理的な日付でも
// 異なるDateインスタンスになり、再取込のたびに点検記録が重複作成されてしまう
// おそれがあるため、日付部分だけを取り出して両経路で同じ正規化を行う。
function parseDateCell(ws: WorkSheet, r: number, c: number): Date | null {
  const addr = utils.encode_cell({ r, c });
  const cell = ws[addr];
  if (!cell) return null;
  if (cell.v instanceof Date) return toUtcDateOnly(cell.v);
  const text = cellText(ws, r, c);
  if (!text) return null;
  // "2016/04/01"や"2016-04-01"等、区切り文字違いの表記はロケールに依存せず
  // 自前でY/M/Dを取り出す（new Date(text)はスラッシュ区切りをローカル時刻として
  // 解釈するため、タイムゾーンによっては日付がずれることがある）。
  const m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const [, y, mo, da] = m;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da)));
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : toUtcDateOnly(d);
}

function toUtcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ワークブック内から「施設一覧」形式のシートを探す（シート名は問わず、
// 想定のヘッダー位置に「管理番号」を持つ最初のシートを採用する）。
export function findFacilityListSheetName(wb: WorkBook): string | null {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (cellText(ws, HEADER_ROW, COL.managementNo) === "管理番号") return name;
  }
  return null;
}

export function parseFacilityListSheet(wb: WorkBook, sheetName: string): ExtractedFacilityListItem[] {
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws["!ref"]) return [];
  const range = utils.decode_range(ws["!ref"]);

  const items: ExtractedFacilityListItem[] = [];
  for (let r = DATA_START_ROW; r <= range.e.r; r++) {
    const managementNo = cellText(ws, r, COL.managementNo);
    if (!managementNo) continue; // 管理番号が無い行はデータ行ではない（末尾の空行等）
    const { latitude, longitude } = parseLatLng(cellText(ws, r, COL.latLng));
    items.push({
      managementNo,
      oldManagementNo: cellText(ws, r, COL.oldManagementNo),
      officeName: cellText(ws, r, COL.officeName),
      facilityField: cellText(ws, r, COL.facilityField),
      routeType: cellText(ws, r, COL.routeType),
      routeName: cellText(ws, r, COL.routeName),
      facilityType: cellText(ws, r, COL.facilityType),
      facilitySubType: cellText(ws, r, COL.facilitySubType),
      facilityName: cellText(ws, r, COL.facilityName),
      location: cellText(ws, r, COL.location),
      latitude,
      longitude,
      constructionYear: cellText(ws, r, COL.constructionYear),
      remarks: cellText(ws, r, COL.remarks),
      regulationLedgerName: cellText(ws, r, COL.regulationLedgerName),
      regulationLedgerUpdatedAt: cellText(ws, r, COL.regulationLedgerUpdatedAt),
      facilityLedgerName: cellText(ws, r, COL.facilityLedgerName),
      facilityLedgerUpdatedAt: cellText(ws, r, COL.facilityLedgerUpdatedAt),
      inspectionType: cellText(ws, r, COL.inspectionType),
      soundnessGrade: cellText(ws, r, COL.soundnessGrade),
      inspectionDate: parseDateCell(ws, r, COL.inspectionDate),
      inspector: cellText(ws, r, COL.inspector),
      mainFindings: cellText(ws, r, COL.mainFindings),
      repairDate: cellText(ws, r, COL.repairDate),
      repairRemarks: cellText(ws, r, COL.repairRemarks),
    });
  }
  return items;
}
