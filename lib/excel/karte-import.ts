import type { WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";

// 防災カルテ様式（全国地質調査業協会連合会 平成25年7月版、karte_sheet_jgca201307）の
// 固定セル位置マップ。実際に一部記入済みのファイル（「国道432号 A001.xls」、および
// 島根県の実データ複数件「B1432A279」「B1432A020」「B3101A019」等）と突き合わせて
// 位置を検証した上で実装している。
//
// 【注記】初版は施設管理番号等が未入力の「国道432号 A001.xls」のみで検証しており、
// 施設管理番号・点検対象項目（カルテ区分）・路線名・距離標の列位置に誤りがあった
// （記入例が無いと列がずれていても空文字列が返るだけで気づけないため）。
// 上記の実データ複数件で再検証し、列位置を修正済み。
//
// 【重要】ここで抽出しているのは「実データで位置を確認できた、または構造上ほぼ
// 疑いようのないフィールド」だけである。以下は意図的に対象外にしている
// （誤った位置のデータをそれらしく取り込んでしまう方が、何も取り込まないより
// 害が大きいため）:
//   - 規制基準等（連続雨量・時間雨量）: ラベルと単位セルの位置は実データで確認できたが、
//     3件とも値セルが未記入だったため、値セルの正確な列位置が確認できていない。
//   - 様式Ａの「着目すべき変状」等の自由記述欄、様式Ｂ（点検対象名）、
//     様式Ｄ（災害履歴）: 今回のテストファイルに記入例が無かったため未対応。
//     様式Ｃ（点検年月日・点検者名等の点検履歴）のみを対象にしている。
// 記入例が増え次第、対応フィールドを広げる。
//
// 【所在地・道路種別・管理機関・台帳番号・交通量・DID区間・バス路線・迂回路・
// 緊急輸送道路区分について】島根県の実データ複数件で値セルの位置を確認し対応した。
//   - 所在地は「（都道府県）（市郡）（市郡の種別）（町村）（町村の種別）（大字等）」の
//     6セル構成だった（例:"島根県"+"安来"+"市"+"広瀬"+"町"+"祖父谷"）。
//     Karte.locationDistrict/locationTownの2カラムしか無いため、
//     都道府県〜町村の種別までをlocationDistrictに、大字等をlocationTownに入れている。
//   - 交通量は「平日／休日」の種別セル＋値セルが1組しか無く、様式は片方のみの記入を
//     想定しているらしい（3件とも「平日」だった）。種別セルの文字列を見て
//     trafficVolumeWeekday／trafficVolumeHolidayのどちらに入れるか決めている。

const FORM_A_SHEET_NAME = "様式Ａ";
const FORM_C_SHEET_NAME = "様式Ｃ";

function cellValue(ws: WorkSheet, r: number, c: number): string | number | undefined {
  const addr = utils.encode_cell({ r, c });
  const cell = ws[addr];
  return cell?.v as string | number | undefined;
}

function cellText(ws: WorkSheet, r: number, c: number): string {
  const val = cellValue(ws, r, c);
  return val === undefined || val === null ? "" : String(val).trim();
}

// 施設管理番号・距離標のように「1マスに半角1文字（または1桁）」で分割入力される
// フィールムを結合する。全セルが空/0の場合は「未入力」とみなしnullを返す
// （テンプレートの初期値としてセルに数値0が入っているケースと区別するため）。
function joinDigits(ws: WorkSheet, r: number, cols: number[]): number | null {
  const raw = cols.map((c) => cellValue(ws, r, c));
  const allEmptyOrZero = raw.every((v) => v === undefined || v === null || v === "" || v === 0);
  if (allEmptyOrZero) return null;
  const joined = raw.map((v) => (v === undefined || v === null || v === "" ? "0" : String(v))).join("");
  const n = Number(joined);
  return Number.isFinite(n) ? n : null;
}

function joinChars(ws: WorkSheet, r: number, cols: number[]): string | null {
  const s = cols.map((c) => cellText(ws, r, c)).join("");
  return s === "" ? null : s;
}

// 距離標（km＋m）専用。joinDigitsと違い「km側のセルが全て空/0」でも
// m側に値があれば未入力扱いにしない（例:"0k020m"のようにルート起点付近で
// km側が0になる実データが実在することを確認したため）。
// km・mの両方のセル群が完全に空（未記入セル）の場合のみnullを返す。
function distanceMarker(ws: WorkSheet, r: number, kmCols: number[], mCols: number[]): number | null {
  const allCols = [...kmCols, ...mCols];
  const allBlank = allCols.every((c) => {
    const v = cellValue(ws, r, c);
    return v === undefined || v === null || v === "";
  });
  if (allBlank) return null;

  const digits = (cols: number[]): number => {
    const s = cols
      .map((c) => {
        const v = cellValue(ws, r, c);
        return v === undefined || v === null || v === "" ? "0" : String(v);
      })
      .join("");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  return digits(kmCols) + digits(mCols) / 1000;
}

// "有"/"該当" → true, "無"/"非該当" → false, それ以外（未記入等）→ null。
function boolLabel(ws: WorkSheet, r: number, c: number, trueLabel: string, falseLabel: string): boolean | null {
  const text = cellText(ws, r, c);
  if (text === trueLabel) return true;
  if (text === falseLabel) return false;
  return null;
}

function dms(ws: WorkSheet, r: number, degCol: number, minCol: number, secCol: number): number | null {
  const deg = Number(cellValue(ws, r, degCol)) || 0;
  const min = Number(cellValue(ws, r, minCol)) || 0;
  const sec = Number(cellValue(ws, r, secCol)) || 0;
  if (deg === 0 && min === 0 && sec === 0) return null;
  return deg + min / 60 + sec / 3600;
}

export type ExtractedKarte = {
  facilityNo: string | null;
  karteTypeLabel: string | null; // 様式の表記そのまま（例:"落石・崩壊"）。呼び出し側でenumに変換する
  manageOrgName: string | null; // 管理機関名
  manageOrgCode: string | null; // 管理機関コード
  ledgerNo: string | null; // 台帳番号
  routeName: string | null;
  distanceMarkerFromKm: number | null;
  distanceMarkerToKm: number | null;
  sideOfRoad: string | null;
  extensionLengthM: number | null;
  projectCategoryLabel: string | null; // "一般" | "有料"
  roadTypeLabel: string | null; // 様式の表記そのまま（例:"一般国道（指定区間外）"）
  roadStatusLabel: string | null; // "現道" | "旧道" | "新道" | "新新道"
  locationDistrict: string | null; // 都道府県〜町村の種別まで（例:"島根県安来市広瀬町"）
  locationTown: string | null; // 大字等（例:"祖父谷"）
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  geodeticSystemLabel: string | null; // "世界測地系" | "日本測地系"
  preTrafficRestriction: boolean | null; // 事前通行規制区間指定 有/無
  trafficVolumeWeekday: number | null; // 交通量：平日(台/12h)
  trafficVolumeHoliday: number | null; // 交通量：休日(台/12h)
  didArea: boolean | null; // ＤＩＤ区間 該当/非該当
  busRoute: boolean | null; // バス路線 該当/非該当
  detour: boolean | null; // 迂回路 有/無
  emergencyRoadCategory: string | null; // 緊急輸送道路区分（様式の表記そのまま。例:"１次"）
};

export function extractKarte(wb: WorkBook): ExtractedKarte | null {
  const ws = wb.Sheets[FORM_A_SHEET_NAME];
  if (!ws) return null;

  // 所在地：（都道府県）（市郡名）（市郡の種別）（町村名）（町村の種別）（大字等）の6セル。
  // 例: "島根県"+"安来"+"市"+"広瀬"+"町"+"祖父谷" → locationDistrict="島根県安来市広瀬町"、
  // locationTown="祖父谷"（Karteが2カラムしか持たないため、末尾の大字等だけ分ける）。
  const locationDistrict =
    joinChars(ws, 5, [28, 31, 34, 35, 38]) /* 都道府県+市郡+市郡種別+町村+町村種別 */ || null;
  const locationTown = cellText(ws, 5, 39) || null;

  // 交通量：「平日」「休日」いずれかの種別セル＋値セルが1組だけ様式にあり、
  // 実データ3件はいずれも「平日」だった。種別セルの表記を見てどちらのカラムに
  // 入れるか決める（両方埋まっている想定はしていない）。
  const trafficTypeLabel = cellText(ws, 6, 40);
  const trafficVolumeValue = joinDigits(ws, 6, [42]);

  return {
    // 施設管理番号は9マス（例:"B1432A279"）。実データ検証前は8マスだと誤認していた。
    facilityNo: joinChars(ws, 4, [6, 7, 8, 9, 10, 11, 12, 13, 14]),
    karteTypeLabel: cellText(ws, 4, 20) || null,
    // 管理機関名は2行に分かれて入力される（例:1行目"島根県"、2行目"広瀬土木事業所"）。
    manageOrgName: (cellText(ws, 1, 74) + cellText(ws, 2, 74)).trim() || null,
    // 管理機関コードは1マスに半角1文字ずつ、7マス（1マスおき）で入力される。
    manageOrgCode: joinChars(ws, 3, [74, 76, 78, 80, 82, 84, 86]),
    ledgerNo: cellText(ws, 4, 51) || null,
    routeName: cellText(ws, 4, 29) || null,
    // 距離標（自）＝ 2桁（km）＋3桁（m）、距離標（至）＝ 同様の2桁＋3桁。
    // （実データ検証前は4桁＋2桁と誤認していた）
    distanceMarkerFromKm: distanceMarker(ws, 4, [61, 62], [63, 64, 65]),
    distanceMarkerToKm: distanceMarker(ws, 4, [69, 70], [71, 72, 73]),
    sideOfRoad: cellText(ws, 4, 78) || null,
    extensionLengthM: joinDigits(ws, 4, [83]),
    projectCategoryLabel: cellText(ws, 5, 4) || null,
    roadTypeLabel: cellText(ws, 5, 10) || null,
    roadStatusLabel: cellText(ws, 5, 22) || null,
    locationDistrict,
    locationTown,
    landmark: cellText(ws, 5, 48) || null,
    latitude: dms(ws, 5, 60, 63, 66),
    longitude: dms(ws, 5, 71, 74, 77),
    geodeticSystemLabel: cellText(ws, 5, 83) || null,
    preTrafficRestriction: boolLabel(ws, 6, 9, "有", "無"),
    trafficVolumeWeekday: trafficTypeLabel === "休日" ? null : trafficVolumeValue,
    trafficVolumeHoliday: trafficTypeLabel === "休日" ? trafficVolumeValue : null,
    didArea: boolLabel(ws, 6, 60, "該当", "非該当"),
    busRoute: boolLabel(ws, 6, 68, "該当", "非該当"),
    detour: boolLabel(ws, 6, 75, "有", "無"),
    emergencyRoadCategory: cellText(ws, 6, 84) || null,
  };
}

export type ExtractedInspectionEvent = {
  inspectionDate: Date;
  inspectorName: string | null;
  weatherLabel: string | null; // "晴" | "曇" | "雨" | "雪"
  specialistInspectionDate: Date | null;
  specialistName: string | null;
  diffFromPrevious: boolean;
  disasterHistory: boolean;
  repairHistory: boolean;
};

// 様式Ｃは1シートあたり最大7回分の点検日を横方向に持つ（それ以上はシート複製）。
// 各点検日の列グループは列18を起点に10列おきに並ぶ。
const DATE_SLOT_COUNT = 7;
function slotBaseCol(i: number): number {
  return 18 + i * 10;
}

function toUtcDate(y: unknown, m: unknown, d: unknown): Date | null {
  const yn = Number(y);
  const mn = Number(m);
  const dn = Number(d);
  if (!yn || !mn || !dn) return null;
  return new Date(Date.UTC(yn, mn - 1, dn));
}

// 「着目すべき変状が複数ある場合の変状ごとの結果（4件まで/シート）」には未対応で、
// 常に1件目のブロック（行8〜10）だけを見る。シート複製・変状追加された実データが
// 手に入り次第、対応を広げる（当面はシングルターゲットの単純なケースのみ）。
export function extractInspectionEvents(wb: WorkBook): ExtractedInspectionEvent[] {
  const ws = wb.Sheets[FORM_C_SHEET_NAME];
  if (!ws) return [];

  const events: ExtractedInspectionEvent[] = [];
  for (let i = 0; i < DATE_SLOT_COUNT; i++) {
    const base = slotBaseCol(i);
    const inspectionDate = toUtcDate(
      cellValue(ws, 5, base),
      cellValue(ws, 5, base + 4),
      cellValue(ws, 5, base + 7)
    );
    if (!inspectionDate) continue; // このスロットは未使用（点検日が入っていない）

    events.push({
      inspectionDate,
      inspectorName: cellText(ws, 33, base) || null,
      weatherLabel: cellText(ws, 26, base + 4) || null,
      specialistInspectionDate: toUtcDate(
        cellValue(ws, 40, base),
        cellValue(ws, 40, base + 4),
        cellValue(ws, 40, base + 7)
      ),
      specialistName: cellText(ws, 41, base) || null,
      diffFromPrevious: cellText(ws, 8, base) === "有",
      disasterHistory: cellText(ws, 9, base) === "有",
      repairHistory: cellText(ws, 10, base) === "有",
    });
  }
  return events;
}
