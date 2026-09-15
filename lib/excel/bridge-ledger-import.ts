import * as XLSX from "xlsx";
import type { WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";
import { extractSheetGrid, type ExtractedGrid } from "@/lib/excel/excel-grid-extract";

// 橋梁台帳（島根県 橋梁点検・橋梁台帳システム(IMS)由来のExcel）の取込（会話ログ
// 「橋梁台帳のエクセルになります…このような台帳を受け取った時に、点検調書と
// 同じように自動的に入力される仕組みを作りたい」参照）。
//
// Excelは5シート構成:
//   - 橋梁調書: 橋名・路線名・所在地・緯度経度・橋長・幅員等、約50項目の
//     基本諸元（1橋1枚のシンプルな台帳）。このシートだけ、点検調書と同じ
//     「1項目=1DB列」で構造化する（下記extractChoushoFields参照）。
//   - 橋梁台帳: 支承・材料集計・工事費等、490箇所超のセル結合を持つ非常に
//     密な構造設計・数量計算の帳票。
//   - 画像: 位置図・工事費・維持管理表等。
//   - 付属図: 平面図・側面図等の添付図面。
//   - IMS設定シート: 非表示（点検調書のIMS設定シートと異なり、この橋梁台帳の
//     実データでは値が入っていなかった。緯度経度は橋梁調書シートから直接取得する）。
// 「橋梁台帳」「画像」「付属図」の3シートは、個々の項目をDB列化せず、
// lib/excel/excel-grid-extract.tsでセル値・結合・列幅・行高をそのままJSON化し、
// BridgeLedgerSheetとして保存する（会話ログ「汎用テーブル表示で再現（推奨）」参照）。
//
// 【セル位置について】gate-sign-inspection-import.tsと同じ方針で、固定セル位置を
// 直接指定する。ただし橋梁調書シートは項目数が多く、実データ（P72-AB-911702
// 藤谷島橋）で値が入っていなかった項目もある。値が確認できた項目は実データの
// セル位置を直接使用し、値が空だった項目は、同じ行・列グループ内で値が確認
// できた項目とのオフセット関係（多くは「ラベル列の5列右が値列」という規則的な
// パターン）から類推した位置を使う。類推の根拠が薄い項目（路下条件の河川・
// 道路・鉄道・その他等、狭い間隔で複数項目が並ぶ区画）は、誤ったセル位置から
// 誤ったデータを取り込むより、未対応（null）のままにする方を選んだ（該当項目は
// 下記コードのコメントに理由を記載）。別の橋梁台帳Excelで値が確認できた際に
// 随時見直すことを想定している。

const CHOUSHO_SHEET_NAME = "橋梁調書";
const GRID_SHEET_NAMES = ["橋梁台帳", "画像", "付属図"] as const;

function cellValue(ws: WorkSheet, r: number, c: number): string | number | Date | undefined {
  const addr = utils.encode_cell({ r, c });
  const cell = ws[addr];
  return cell?.v as string | number | Date | undefined;
}

function cellText(ws: WorkSheet, r: number, c: number): string | null {
  const val = cellValue(ws, r, c);
  if (val === undefined || val === null) return null;
  if (val instanceof Date) return null; // 日付セルはcellDateで別途扱う
  const s = String(val).trim();
  return s === "" ? null : s;
}

function cellNumber(ws: WorkSheet, r: number, c: number): number | null {
  const val = cellValue(ws, r, c);
  if (val === undefined || val === null || val === "") return null;
  if (val instanceof Date) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function cellInt(ws: WorkSheet, r: number, c: number): number | null {
  const n = cellNumber(ws, r, c);
  return n === null ? null : Math.trunc(n);
}

// 未入力の日付セルが異常値になっていることがある（FacilityListItem.constructionYear
// で確認済みの問題と同種）。実データ「P72-AB-911702 藤谷島橋」の架設年月日セルで
// 確認したところ、値は西暦の古い年ではなく、Excelのシリアル値25569（＝UNIX
// エポック1970-01-01に相当する、日付変換ライブラリでの定番の変換先）そのもの
// だった。西暦の下限で足切りする方式（例:1950年未満は無視）では、この
// ちょうど25569というシリアル値を狙い撃ちできない（1970年は下限を超えて
// しまう）ため、「シリアル値25569＝未入力の初期値」という具体的な値を直接
// 判定する方式にした。西暦1950年より前の日付も、念のため同様に無効とみなす
// （FacilityListItem側で確認された1899年ケースと同種の異常値に備える）。
const UNSET_DATE_SERIAL = 25569; // 1970-01-01 (UNIXエポック)

function cellDateJapaneseOrNull(ws: WorkSheet, r: number, c: number): string | null {
  const val = cellValue(ws, r, c);
  if (!(val instanceof Date)) return null;
  // xlsx.read({cellDates:true})は、シリアル値をUTC日付として変換する
  // （SheetJS公式ドキュメント参照）。1899-12-30起点でシリアル値を逆算し、
  // 前述のセンチネル値と比較する。
  const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
  const serial = Math.round((val.getTime() - EXCEL_EPOCH_UTC_MS) / 86400000);
  if (serial === UNSET_DATE_SERIAL) return null;
  if (val.getUTCFullYear() < 1950) return null;
  return `${val.getUTCFullYear()}年${val.getUTCMonth() + 1}月${val.getUTCDate()}日`;
}

function dms(deg: number | null, min: number | null, sec: number | null): number | null {
  if (deg === null && min === null && sec === null) return null;
  return (deg ?? 0) + (min ?? 0) / 60 + (sec ?? 0) / 3600;
}

// ファイル名の先頭にある管理番号（例:「P72-AB-911702」）を取り出す。点検調書
// （gate-sign-inspection-import.ts）と異なり、橋梁台帳は管理番号セル自体が
// Excel内にあるためファイル名は使わないが、ファイル名にも同じ書式で含まれて
// いる（万一シート内が空欄の場合のフォールバックとして併用する）。
function parseManagementNoFromFileName(fileName: string): string | null {
  const m = fileName.match(/^([A-Za-z0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+)_/);
  return m ? m[1] : null;
}

export type BridgeLedgerFields = {
  managementNo: string | null;
  managementCategory: string | null;
  bridgeNameKana: string | null;
  bridgeName: string | null;
  officeName: string | null;
  routeName: string | null;
  spanCount: number | null;
  constructedAt: string | null;
  location: string | null;
  bridgeType: string | null;
  bridgeLengthM: number | null;
  superstructureType: string | null;
  deckMaterial: string | null;
  substructureType: string | null;
  appliedSpec: string | null;
  latitude: number | null;
  longitude: number | null;
  widthRoadwayM: number | null;
  widthSidewalkM: number | null;
  widthShoulderM: number | null;
  widthCurbM: number | null;
  widthOtherM: number | null;
  widthTotalM: number | null;
  widthRemarks: string | null;
  areaRoadwayM2: number | null;
  areaSidewalkM2: number | null;
  areaShoulderM2: number | null;
  areaCurbM2: number | null;
  areaOtherM2: number | null;
  areaTotalM2: number | null;
  censusNo: string | null;
  seismicReinforcement: string | null;
  surveyYear: string | null;
  trafficVolume: string | null;
  largeVehicleTraffic: string | null;
  coastDistance: string | null;
  emergencyTransportRoad: string | null;
  priorityRoute: string | null;
  mainGirderCount: number | null;
  abutmentHeightM: number | null;
  pierHeightM: number | null;
  occupyingObjectName: string | null;
  denselyPopulatedArea: string | null;
  detourRoute: string | null;
  busRoute: string | null;
  overpassRailway: string | null;
  overpassRoad: string | null;
  overseaBridge: string | null;
  longBridge: string | null;
  saltDamageArea: string | null;
  upDownLine: string | null;
  bicycleRoad: string | null;
  footbridge: string | null;
  sideRoadBridge: string | null;
  weatheringSteel: string | null;
  underRiver: string | null;
  underRoad: string | null;
  bridgeManagementCategory: string | null;
  roadCategory: string | null;
  loadRestriction: string | null;
  underRailway: string | null;
  underOther: string | null;
};

function joinNonEmpty(parts: (string | null)[], sep: string): string | null {
  const filtered = parts.filter((p): p is string => !!p);
  return filtered.length > 0 ? filtered.join(sep) : null;
}

function extractChoushoFields(ws: WorkSheet, fileName: string): BridgeLedgerFields {
  const fromLoc = joinNonEmpty([cellText(ws, 4, 22), cellText(ws, 4, 28)], "");
  const toLoc = joinNonEmpty([cellText(ws, 4, 37), cellText(ws, 4, 43)], "");
  const location = joinNonEmpty([fromLoc ? `自：${fromLoc}` : null, toLoc ? `至：${toLoc}` : null], "　");

  const a1 = cellText(ws, 5, 37);
  const a2 = cellText(ws, 5, 50);
  const substructureType = joinNonEmpty([a1 ? `A1：${a1}` : null, a2 ? `A2：${a2}` : null], "／");

  const latitude = dms(cellNumber(ws, 6, 54), cellNumber(ws, 6, 57), cellNumber(ws, 6, 60));
  const longitude = dms(cellNumber(ws, 6, 65), cellNumber(ws, 6, 68), cellNumber(ws, 6, 71));

  return {
    managementNo: cellText(ws, 0, 67) ?? parseManagementNoFromFileName(fileName),
    managementCategory: cellText(ws, 1, 67),
    bridgeNameKana: cellText(ws, 2, 5),
    bridgeName: cellText(ws, 3, 5),
    officeName: cellText(ws, 2, 30),
    routeName: cellText(ws, 2, 50),
    spanCount: cellInt(ws, 2, 20),
    constructedAt: cellDateJapaneseOrNull(ws, 2, 67),
    location,
    bridgeType: cellText(ws, 4, 55),
    bridgeLengthM: cellNumber(ws, 4, 67),
    superstructureType: cellText(ws, 5, 5),
    deckMaterial: cellText(ws, 5, 20),
    substructureType,
    appliedSpec: cellText(ws, 6, 40),
    latitude,
    longitude,
    // 幅員・面積は車道／自・歩道／路肩／地覆／その他／合計の6区分がExcel上
    // そのまま列（実データではc=5,10,15,20,25,30）になっている（会話ログ・
    // 実データ確認済み。自・歩道／地覆／その他は実データでは空欄だったが、
    // 列の並び自体はヘッダー行で確認済みのため、同じ規則で位置を対応させている）。
    widthRoadwayM: cellNumber(ws, 8, 5),
    widthSidewalkM: cellNumber(ws, 8, 10),
    widthShoulderM: cellNumber(ws, 8, 15),
    widthCurbM: cellNumber(ws, 8, 20),
    widthOtherM: cellNumber(ws, 8, 25),
    widthTotalM: cellNumber(ws, 8, 30),
    widthRemarks: cellText(ws, 8, 35),
    areaRoadwayM2: cellNumber(ws, 9, 5),
    areaSidewalkM2: cellNumber(ws, 9, 10),
    areaShoulderM2: cellNumber(ws, 9, 15),
    areaCurbM2: cellNumber(ws, 9, 20),
    areaOtherM2: cellNumber(ws, 9, 25),
    areaTotalM2: cellNumber(ws, 9, 30),
    // センサス番号・調査年・交通量は実データでは空欄だったため、同じ行にある
    // 他項目（大型車交通量。ラベルの5列右に値がある）と同じオフセット規則から
    // 類推した位置。
    censusNo: cellText(ws, 10, 5),
    seismicReinforcement: cellText(ws, 10, 20),
    surveyYear: cellText(ws, 11, 10),
    trafficVolume: cellText(ws, 11, 18),
    largeVehicleTraffic: cellText(ws, 11, 29),
    coastDistance: cellText(ws, 12, 8),
    emergencyTransportRoad: cellText(ws, 12, 29),
    priorityRoute: cellText(ws, 13, 8),
    mainGirderCount: cellInt(ws, 15, 5),
    abutmentHeightM: cellNumber(ws, 15, 16),
    pierHeightM: cellNumber(ws, 15, 28),
    // 占用物件（名称）も実データでは空欄。同じ行の「橋脚高さ」ラベルからの
    // 値オフセット（+5列）から類推した位置。
    occupyingObjectName: cellText(ws, 15, 40),
    denselyPopulatedArea: cellText(ws, 16, 5),
    detourRoute: cellText(ws, 16, 14),
    busRoute: cellText(ws, 16, 23),
    overpassRailway: cellText(ws, 17, 5),
    overpassRoad: cellText(ws, 17, 14),
    overseaBridge: cellText(ws, 17, 23),
    longBridge: cellText(ws, 17, 32),
    // 塩害地域は実データでは空欄で、近くの「上下線」項目（AQ列・AU列、
    // ラベルの4列右が値）とは列位置の区画が異なり、確度の高いオフセットを
    // 類推できなかったため未対応（null）のままにする。
    saltDamageArea: null,
    upDownLine: cellText(ws, 17, 46),
    // 自転車道・歩道橋・側道橋・耐候性鋼材は実データでは空欄だったが、真上の行
    // （跨線橋・跨道線・渡海橋・長大橋。全項目でラベルの5列右に値を確認済み）と
    // 全く同じ列位置に並んでいるため、同じオフセットが適用できると判断した。
    bicycleRoad: cellText(ws, 18, 5),
    footbridge: cellText(ws, 18, 14),
    sideRoadBridge: cellText(ws, 18, 23),
    weatheringSteel: cellText(ws, 18, 32),
    // 路下条件（河川・道路・鉄道・その他）は、塩害地域と同じ狭い区画にあり
    // 確度の高いオフセットを類推できなかったため未対応（null）のままにする。
    underRiver: null,
    underRoad: null,
    bridgeManagementCategory: cellText(ws, 19, 14),
    // 自専道or一般道・荷重制限は実データでは空欄だったが、真上の行（渡海橋・
    // 長大橋。ラベルの5列右に値を確認済み）と同じ列位置のため、同じオフセットを
    // 適用した。
    roadCategory: cellText(ws, 19, 23),
    loadRestriction: cellText(ws, 19, 32),
    underRailway: null,
    underOther: null,
  };
}

export type BridgeLedgerSheetData = { sheetName: string; label: string; grid: ExtractedGrid };

export type BridgeLedgerData = BridgeLedgerFields & {
  sourceFileName: string;
  sheets: BridgeLedgerSheetData[];
};

// ワークブック全体から橋梁台帳1件分のデータを組み立てる。「橋梁調書」シートが
// 見つからない場合（想定外の形式のファイル）はnullを返す。
export function parseBridgeLedgerExcel(buffer: Buffer, fileName: string): BridgeLedgerData | null {
  // !cols/!rowsの取得にはcellStyles:trueが必要（オプション無しだと空配列に
  // なることを実データで確認済み。lib/excel/excel-grid-extract.ts参照）。
  const wb: WorkBook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellStyles: true });
  const choushoSheet = wb.Sheets[CHOUSHO_SHEET_NAME];
  if (!choushoSheet) return null;

  const fields = extractChoushoFields(choushoSheet, fileName);

  const sheets: BridgeLedgerSheetData[] = [];
  for (const sheetName of GRID_SHEET_NAMES) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    sheets.push({ sheetName, label: sheetName, grid: extractSheetGrid(ws, sheetName) });
  }

  return { ...fields, sourceFileName: fileName, sheets };
}
