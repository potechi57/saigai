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
//   - 所在地（郡・町名）: 「郡」「町」というラベルが値の前に来るのか後に来るのか
//     （＝選択した行政区分の種別を表す語なのか、単なる項目ラベルなのか）を、
//     実際に記入された例が無く確認できていない。
//   - 道路種別: ブランクのテンプレートでしか位置を確認できておらず、値セルの
//     正確な列位置を実データで検証できていない。
//   - 様式Ａの「着目すべき変状」等の自由記述欄、様式Ｂ（点検対象名）、
//     様式Ｄ（災害履歴）: 今回のテストファイルに記入例が無かったため未対応。
//     様式Ｃ（点検年月日・点検者名等の点検履歴）のみを対象にしている。
// 記入例が増え次第、対応フィールドを広げる。

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
  routeName: string | null;
  distanceMarkerFromKm: number | null;
  distanceMarkerToKm: number | null;
  sideOfRoad: string | null;
  extensionLengthM: number | null;
  projectCategoryLabel: string | null; // "一般" | "有料"
  roadStatusLabel: string | null; // "現道" | "旧道" | "新道" | "新新道"
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  geodeticSystemLabel: string | null; // "世界測地系" | "日本測地系"
};

export function extractKarte(wb: WorkBook): ExtractedKarte | null {
  const ws = wb.Sheets[FORM_A_SHEET_NAME];
  if (!ws) return null;

  return {
    // 施設管理番号は9マス（例:"B1432A279"）。実データ検証前は8マスだと誤認していた。
    facilityNo: joinChars(ws, 4, [6, 7, 8, 9, 10, 11, 12, 13, 14]),
    karteTypeLabel: cellText(ws, 4, 20) || null,
    routeName: cellText(ws, 4, 29) || null,
    // 距離標（自）＝ 2桁（km）＋3桁（m）、距離標（至）＝ 同様の2桁＋3桁。
    // （実データ検証前は4桁＋2桁と誤認していた）
    distanceMarkerFromKm: distanceMarker(ws, 4, [61, 62], [63, 64, 65]),
    distanceMarkerToKm: distanceMarker(ws, 4, [69, 70], [71, 72, 73]),
    sideOfRoad: cellText(ws, 4, 78) || null,
    extensionLengthM: joinDigits(ws, 4, [83]),
    projectCategoryLabel: cellText(ws, 5, 4) || null,
    roadStatusLabel: cellText(ws, 5, 22) || null,
    landmark: cellText(ws, 5, 48) || null,
    latitude: dms(ws, 5, 60, 63, 66),
    longitude: dms(ws, 5, 71, 74, 77),
    geodeticSystemLabel: cellText(ws, 5, 83) || null,
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
