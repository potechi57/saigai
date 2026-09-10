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
//
// 【専門技術者による点検・着目すべき変状・点検内容の要点・専門技術者のコメント・
// 対応区分／評価年月日・点検の時期・想定される災害形態・変状が出たときの対応・
// 主な災害形態・点検者/専門技術者の氏名・会社名・連絡先・作成年月日・天候について】
// これも実データ複数件で位置を確認した。
//   - 「着目すべき変状」というラベルは様式内に2箇所ある（①専門技術者による点検欄の
//     すぐ下の短い一言、②点検の時期等と並ぶ表の中の欄）。実データではこの2箇所の内容が
//     異なっていた（例:①"様式B-①・②浮石" ②"①・②浮石の安定度の進展"）。
//     Karte.keyDeformationSummaryは1カラムしか無いため①（点検内容の要点と対になっている方）
//     を採用し、②は取り込んでいない。
//   - 対応区分は「①対策工が必要／②カルテ対応／③対策不要／④対策完了」の4行表になっており、
//     選択された行にのみ"○"と評価年月日が入る（実データで行の位置＝選択される対応区分は
//     カルテごとに異なることを確認済み）。4行を順に見て"○"がある行を採用する。
//   - 点検の時期は「①定期・(頻度)」「②不定期・豪雨・(固定文言)」「③不定期・震度・(固定文言)」
//     の3行があるが、②③は実データ3件とも一字一句ほぼ同じ固定的な参考文言（フォーム上の
//     デフォルト注記）で、①だけがカルテごとに異なる値（例:"1年に1回"）を持っていた。
//     そのため①の行のみを取り込み、常にinspectionPeriodType=REGULARとしている
//     （②③が選択されているケースの実データが無いため、不定期側の判定方法は未確認）。
//   - 主な災害形態（落石／崩壊）は、2箇所ある固定位置のどちらかに"○"が入る形式
//     （実データで両方のパターンを確認済み）。
export type ExtractedRockfallMainForm = {
  rockfall: boolean;
  collapse: boolean;
};

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
  specialistInspectionRequired: boolean | null; // 専門技術者による点検 有/無
  keyDeformationSummary: string | null; // 着目すべき変状（専門技術者による点検欄の下の一言）
  inspectionContentSummary: string | null; // 点検内容の要点
  specialistComment: string | null; // 専門技術者のコメント
  responseCategoryLabel: string | null; // 対応区分（様式の表記そのまま。例:"対策工が必要"）
  responseEvaluatedAt: Date | null; // 評価年月日
  inspectionPeriodTypeLabel: string | null; // 点検の時期（"定期"のみ対応。上記コメント参照）
  inspectionIntervalNote: string | null; // 例:"1年に1回"
  assumedDisasterForm: string | null; // 想定される災害形態
  responseWhenDeformed: string | null; // 変状が出たときの対応
  mainForm: ExtractedRockfallMainForm; // 主な災害形態（落石・崩壊）
  inspectorName: string | null; // 点検者名
  inspectorCompany: string | null;
  inspectorTel: string | null;
  specialistName: string | null; // 専門技術者名
  specialistCompany: string | null;
  specialistTel: string | null;
  createdOnSiteDate: Date | null; // 様式作成年月日
  createdOnSiteWeatherLabel: string | null; // 天候（"晴"|"曇"|"雨"|"雪"）
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

  // 対応区分（①〜④）は行28〜31（0始まりでr=27〜30）に並ぶ4択で、選択された行にだけ
  // "○"（列67）と評価年月日（列77/81/84＝年/月/日）が入る。選択行は施設ごとに異なるため、
  // 4行を順に見て"○"がある行を採用する（見つからなければ両方null＝未評価のまま）。
  let responseCategoryLabel: string | null = null;
  let responseEvaluatedAt: Date | null = null;
  for (let i = 0; i < 4; i++) {
    const r = 27 + i;
    if (cellText(ws, r, 67) === "○") {
      responseCategoryLabel = cellText(ws, r, 71) || null;
      responseEvaluatedAt = toUtcDate(cellValue(ws, r, 77), cellValue(ws, r, 81), cellValue(ws, r, 84));
      break;
    }
  }

  // 主な災害形態（落石／崩壊）。2箇所ある固定位置のどちらかに"○"が入る。
  const mainForm: ExtractedRockfallMainForm = {
    rockfall: cellText(ws, 40, 50) === "○",
    collapse: cellText(ws, 40, 55) === "○",
  };

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
    specialistInspectionRequired: boolLabel(ws, 7, 85, "有", "無"),
    keyDeformationSummary: cellText(ws, 9, 62) || null,
    inspectionContentSummary: cellText(ws, 9, 70) || null,
    specialistComment: cellText(ws, 27, 2) || null,
    responseCategoryLabel,
    responseEvaluatedAt,
    // 点検の時期は「定期」の行（列23）のみ対応。上記コメント参照。
    inspectionPeriodTypeLabel: cellText(ws, 33, 23) || null,
    inspectionIntervalNote: cellText(ws, 33, 26) || null,
    assumedDisasterForm: cellText(ws, 33, 44) || null,
    responseWhenDeformed: cellText(ws, 33, 65) || null,
    mainForm,
    inspectorName: cellText(ws, 41, 30) || null,
    inspectorCompany: cellText(ws, 41, 48) || null,
    inspectorTel: cellText(ws, 41, 72) || null,
    specialistName: cellText(ws, 42, 30) || null,
    specialistCompany: cellText(ws, 42, 48) || null,
    specialistTel: cellText(ws, 42, 72) || null,
    createdOnSiteDate: toUtcDate(cellValue(ws, 42, 6), cellValue(ws, 42, 10), cellValue(ws, 42, 13)),
    createdOnSiteWeatherLabel: cellText(ws, 42, 20) || null,
  };
}

// 様式Ｂのシート名は変状（点検対象）が1件だけの場合は"様式Ｂ"、複数ある場合は
// "様式Ｂ (1)"「様式Ｂ(2)"のように連番が付く（実データで確認済み。括弧の前の
// 半角スペース有無が統一されていないため、両方にマッチする正規表現にしている）。
const FORM_B_SHEET_PATTERN = /^様式Ｂ(?:\s*\(\d+\))?$/;

export function findFormBSheetNames(wb: WorkBook): string[] {
  return wb.SheetNames.filter((name) => FORM_B_SHEET_PATTERN.test(name));
}

// 「現状記録写真」シート（様式Ａ・様式Ｂに収まらなかった写真をまとめる別シート）。
// 実データでは年度プレフィックス付き「R7現状記録写真」（半角英数字。年度は毎年
// 変わるため数字は固定しない）と、プレフィックス無しの「現状記録写真」の両方を確認済み。写真が多い
// カルテでは様式Ｂ同様に連番シート「〜写真 (2)」「〜写真 (3)」が追加される
// （1シートにつき最大2列×2行＝4枚程度の配置を実データで確認済みだが、Web版では
// 決め打ちにせず、抽出できた画像を単純に全部並べる方式にしている）。
const RECORD_PHOTO_SHEET_PATTERN = /^R?\d*現状記録写真(?:\s*\(\d+\))?$/;

export function findRecordPhotoSheetNames(wb: WorkBook): string[] {
  return wb.SheetNames.filter((name) => RECORD_PHOTO_SHEET_PATTERN.test(name));
}

export type ExtractedFormBTarget = {
  sheetName: string;
  sequenceLabel: string | null; // 変状No.（"①"等）そのまま
  keyPoints: string | null; // 着目すべき点
  checkItems: string | null; // チェック項目
  createdOnSiteDate: Date | null;
  createdOnSiteWeatherLabel: string | null;
};

// 様式Ｂ1シート分（＝変状/点検対象1件分）の内容を抽出する。
// 様式Ａの施設管理番号・路線名・距離標等はここにも重複して入っているが、
// カルテ側で既に取得済みのため対象外にしている。
export function extractFormBTarget(wb: WorkBook, sheetName: string): ExtractedFormBTarget | null {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  return {
    sheetName,
    sequenceLabel: cellText(ws, 5, 8) || null,
    keyPoints: cellText(ws, 32, 45) || null,
    checkItems: cellText(ws, 38, 45) || null,
    createdOnSiteDate: toUtcDate(cellValue(ws, 42, 6), cellValue(ws, 42, 10), cellValue(ws, 42, 13)),
    createdOnSiteWeatherLabel: cellText(ws, 42, 20) || null,
  };
}

// 変状No.（①②③④）の丸数字→通し番号。様式Ｂ・様式Ｃで共通して使う
// （InspectionTarget.sequenceNoの決め方）。丸数字以外の表記が来た場合はnullを返し、
// 呼び出し側で「見つかった順に1,2,3...を振る」フォールバックに任せる。
const CIRCLED_NUMBERS: Record<string, number> = {
  "①": 1,
  "②": 2,
  "③": 3,
  "④": 4,
  "⑤": 5,
  "⑥": 6,
};
export function circledNumberToSeq(label: string | null): number | null {
  if (!label) return null;
  return CIRCLED_NUMBERS[label] ?? null;
}

// 通し番号→丸数字（上記の逆方向）。様式Ｂ・様式Ｄの入れ子タブのラベルや、
// 「現状記録写真」シートの取込時にどのシート由来かを示すのに使う。
// 範囲外の番号（⑦以降）はそのまま数値で表示する。
const CIRCLED_NUMBER_LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
export function seqToCircledNumber(n: number): string {
  return CIRCLED_NUMBER_LABELS[n - 1] ?? `No.${n}`;
}

export type ExtractedInspectionEventTargetResult = {
  sequenceNo: number; // 変状No.（①→1等）
  comment: string | null; // 状況欄（実データでは"スプレーでマーキング"等の自由記述）
  diffFromPrevious: boolean;
  disasterHistory: boolean;
  repairHistory: boolean;
};

export type ExtractedInspectionEvent = {
  inspectionDate: Date;
  inspectorName: string | null;
  weatherLabel: string | null; // "晴" | "曇" | "雨" | "雪"
  specialistInspectionDate: Date | null;
  specialistName: string | null;
  specialTopics: string | null; // 点検時の特記事項（点検時の対応）
  // 点検後の対応（専門技術者の判定）。様式の表記そのまま（例:"対策工が必要"）。
  // 【注記】実データ3件はいずれもこの項目が未記入だったため、値セルの位置
  // （行のみ・列はbase固定）は「点検者名と同じく同一行に値が入る」という
  // 直前の項目の並びから類推した未確認の位置。記入例が見つかり次第要検証。
  specialistJudgementLabel: string | null;
  nextInspectionDueYear: number | null; // 次回点検実施時期（年度）
  targetResults: ExtractedInspectionEventTargetResult[];
};

// 様式Ｃは1シートあたり最大7回分の点検日を横方向に持つ（それ以上はシート複製）。
// 各点検日の列グループは列18を起点に10列おきに並ぶ。
const DATE_SLOT_COUNT = 7;
function slotBaseCol(i: number): number {
  return 18 + i * 10;
}

// 変状（点検対象）ごとの結果は縦方向に最大4件まで、1件あたり5行を占める
// （実データで確認済み: 1件目は行6〜10＝変状No.・状況行＋前回との差異・被災履歴・補修履歴、
// 2件目は行11〜15、3件目は行16〜20、4件目は行21〜25、という5行おきの並び）。
const FORM_C_MAX_TARGET_BLOCKS = 4;
function targetBlockLabelRow(blockIndex: number): number {
  return 6 + blockIndex * 5;
}

function toUtcDate(y: unknown, m: unknown, d: unknown): Date | null {
  const yn = Number(y);
  const mn = Number(m);
  const dn = Number(d);
  if (!yn || !mn || !dn) return null;
  return new Date(Date.UTC(yn, mn - 1, dn));
}

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

    const targetResults: ExtractedInspectionEventTargetResult[] = [];
    for (let b = 0; b < FORM_C_MAX_TARGET_BLOCKS; b++) {
      const labelRow = targetBlockLabelRow(b);
      // 変状No.（①等）は列1に固定（点検日の列に関わらず1箇所だけ）。未記入＝この変状枠は未使用。
      const marker = cellText(ws, labelRow, 1);
      if (!marker) continue;
      targetResults.push({
        sequenceNo: circledNumberToSeq(marker) ?? b + 1,
        comment: cellText(ws, labelRow, base) || null,
        diffFromPrevious: cellText(ws, labelRow + 2, base) === "有",
        disasterHistory: cellText(ws, labelRow + 3, base) === "有",
        repairHistory: cellText(ws, labelRow + 4, base) === "有",
      });
    }

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
      specialTopics: cellText(ws, 27, base) || null,
      specialistJudgementLabel: cellText(ws, 34, base) || null,
      nextInspectionDueYear: joinDigits(ws, 42, [base]),
      targetResults,
    });
  }
  return events;
}
