import * as XLSX from "xlsx";
import type { WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";
import { extractSheetImages, type ExtractedImage } from "@/lib/excel/karte-image-extract";
import { extractSheetGrid, type ExtractedGrid } from "@/lib/excel/excel-grid-extract";

// 点検調書＞道路＞法面構造物のExcel取込（会話ログ「法面構造物（新規実装
// 一式）」参照。サンプルファイル34件（例:「A01-AH-900051_01_４３１号_
// 西川津町_18.88_法面構造物.xlsx」）で構造を確認済み）。
// 門型標識・橋梁とは発行元・様式体系が異なる独自フォーマットで、シートは
// 「点検表」「様式1－(2)」〜「様式7－(2)」（構造物種類別の点検チェック
// シート。固定7種類のテンプレートが常に全て存在し、点検表の「点検対象項目」
// が指す1枚だけに実データが入る）「IMS設定シート」の9枚構成。
// データモデルの設計判断はprisma/schema.prismaのSlopeStructureInspection
// コメント参照。

function cellValue(ws: WorkSheet, r: number, c: number): string | number | Date | undefined {
  const addr = utils.encode_cell({ r, c });
  const cell = ws[addr];
  return cell?.v as string | number | Date | undefined;
}

function cellText(ws: WorkSheet, r: number, c: number): string | null {
  const val = cellValue(ws, r, c);
  if (val === undefined || val === null) return null;
  // 日付セル（撮影日・点検日等）はキャプション探索で拾っても意味のある文字列に
  // ならないため除外する（cellDate側で別途日付として読む）。
  if (val instanceof Date) return null;
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

function findSheet(wb: WorkBook, name: string): { name: string; ws: WorkSheet } | null {
  const exact = wb.SheetNames.find((n) => n.trim() === name);
  if (exact) return { name: exact, ws: wb.Sheets[exact] };
  const prefixed = wb.SheetNames.find((n) => n.trim().startsWith(name));
  return prefixed ? { name: prefixed, ws: wb.Sheets[prefixed] } : null;
}

// 点検表シートの緯度経度（度・分・秒。実データ確認済み: AS2=緯度ラベル、
// AU2=度、AW2=分、AY2=秒、BA2=経度ラベル、BC2=度、BE2=分、BG2=秒。
// 門型標識・橋梁と異なりIMS設定シートではなく点検表シート自身に載っている）。
function extractLatLng(ws: WorkSheet): { latitude: number | null; longitude: number | null } {
  const latDeg = cellNumber(ws, 1, 46); // AU2
  const latMin = cellNumber(ws, 1, 48); // AW2
  const latSec = cellNumber(ws, 1, 50); // AY2
  const lonDeg = cellNumber(ws, 1, 54); // BC2
  const lonMin = cellNumber(ws, 1, 56); // BE2
  const lonSec = cellNumber(ws, 1, 58); // BG2
  const latitude = latDeg != null ? latDeg + (latMin ?? 0) / 60 + (latSec ?? 0) / 3600 : null;
  const longitude = lonDeg != null ? lonDeg + (lonMin ?? 0) / 60 + (lonSec ?? 0) / 3600 : null;
  return { latitude, longitude };
}

export type SlopeStructureInspectionPhotoCategory = "sitePlan" | "overview" | "damage" | "checklist";

export type SlopeStructureInspectionPhotoData = {
  image: ExtractedImage;
  caption: string | null;
  category: SlopeStructureInspectionPhotoCategory;
};

export type SlopeStructureInspectionSheetData = {
  sheetName: string;
  label: string;
  grid: ExtractedGrid;
};

export type SlopeStructureInspectionData = {
  managementNo: string | null; // 箇所番号
  structureType: string | null; // 点検対象項目
  managerOrgName: string | null;
  routeName: string | null;
  location: string | null;
  distanceMarkFrom: string | null;
  distanceMarkTo: string | null;
  latitude: number | null;
  longitude: number | null;
  inspectionDate: Date | null;
  photoDate: Date | null;
  weather: string | null;
  structureScore: number | null;
  groundScore: number | null;
  overallJudgment: string | null;
  geologyDescription: string | null;
  summaryComment: string | null;
  inspectionFindings: string | null;
  dailyInspectionPoints: string | null;
  sheets: SlopeStructureInspectionSheetData[];
  photos: SlopeStructureInspectionPhotoData[];
};

// 点検表シートの「現況写真」欄近くにある写真から、番号付き損傷写真
// （①②③…）と、無番号の現況写真・平面図を仕分ける。実データ確認済み配置:
//   - 平面図・概略断面図: AS3ラベルの右（col 44付近）、行4〜5あたり
//   - 現況写真: AA34ラベルの右（col 28付近）、行34〜35あたり
//   - 損傷写真①〜⑤: 行43〜58あたりに貼られ、キャプション（「①開口ひび割れ
//     …」）は写真の直下ではなく同じ列の8行程度下にまとまって並ぶ（実データ
//     確認済み。①は近景・遠景の2枚を持つこともあり、その場合も同じ列に
//     揃う）。そのため「同じ行の近く」ではなく「同じ列で一番近い番号付き
//     キャプション」を探す方式にする。
function findNearbyCaption(ws: WorkSheet, imageFromRow: number, imageFromCol: number): string | null {
  for (const rowOffset of [-1, -2, 1, 2, -3, 3]) {
    for (const colOffset of [0, -1, 1, -2, 2, -3, 3]) {
      const text = cellText(ws, imageFromRow + rowOffset, imageFromCol + colOffset);
      if (text) return text;
    }
  }
  return null;
}

const NUMBERED_CAPTION_PATTERN = /^[①②③④⑤⑥⑦⑧⑨]/;

// シート全体から番号付きキャプション（①②③…）セルを探す。点検表の損傷写真
// キャプションは行43〜58あたりに固まっているが、多少のずれに備え広めに走査する。
function findNumberedCaptions(ws: WorkSheet): { row: number; col: number; text: string }[] {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = utils.decode_range(ref);
  const found: { row: number; col: number; text: string }[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const text = cellText(ws, r, c);
      if (text && NUMBERED_CAPTION_PATTERN.test(text)) found.push({ row: r, col: c, text });
    }
  }
  return found;
}

async function extractTenkenHyoPhotos(buffer: Buffer, sheetName: string, ws: WorkSheet): Promise<SlopeStructureInspectionPhotoData[]> {
  const images = await extractSheetImages(buffer, sheetName);
  const numberedCaptions = findNumberedCaptions(ws);

  // 列→行の順（extractSheetImagesの既定ソート）のまま、位置で種別を仕分ける。
  // 平面図・概略断面図は先頭付近の行（点検表上部のAS3ラベル周辺）に貼られる
  // ため、行が小さい（<20）ものを平面図とする（実データ確認済み: 平面図は
  // row4付近、現況写真・損傷写真はrow34以降）。
  return images.map((image) => {
    if (image.fromRow < 20) {
      return { image, caption: findNearbyCaption(ws, image.fromRow, image.fromCol), category: "sitePlan" as const };
    }

    // 同じ列にある番号付きキャプションのうち、行が最も近いものを採用する
    // （列がぴったり一致することが多いが、貼り付け位置が1列ずれる実データも
    // 確認済みのため、完全一致→±1列の順で探す。±2まで緩めると別の写真の
    // 列と衝突するケースがあったため、それより広げない）。
    const byDistance = (list: typeof numberedCaptions) =>
      [...list].sort((a, b) => Math.abs(a.row - image.fromRow) - Math.abs(b.row - image.fromRow));
    const exact = numberedCaptions.filter((cap) => cap.col === image.fromCol);
    const offByOne = numberedCaptions.filter((cap) => Math.abs(cap.col - image.fromCol) === 1);
    const sameColumn = byDistance(exact.length > 0 ? exact : offByOne);
    if (sameColumn.length > 0) {
      return { image, caption: sameColumn[0].text, category: "damage" as const };
    }

    return { image, caption: findNearbyCaption(ws, image.fromRow, image.fromCol), category: "overview" as const };
  });
}

// 点検チェックシート（様式N）にも「写真またはスケッチ」欄の直後に写真数枚が
// 貼られることがある（実データ確認済み: 地山状況・モルタル表面等の補足写真）。
// この欄のラベル自体（「写真またはスケッチ」）をキャプションとして拾って
// しまうケースがあるため、その文字列だけは除外する。
function isSectionLabelNoise(text: string): boolean {
  const compact = text.replace(/[\s　]/g, "");
  return compact === "写真またはスケッチ";
}

async function extractChecklistPhotos(buffer: Buffer, sheetName: string, ws: WorkSheet): Promise<SlopeStructureInspectionPhotoData[]> {
  const images = await extractSheetImages(buffer, sheetName);
  return images.map((image) => {
    const caption = findNearbyCaption(ws, image.fromRow, image.fromCol);
    return { image, caption: caption && !isSectionLabelNoise(caption) ? caption : null, category: "checklist" as const };
  });
}

// 様式1〜7（点検チェックシート）のうち、点検表の「点検対象項目」（例:
// 「モルタル吹付け」）に一致する1枚を探す。各様式シートのB1に
// 「点検チェックシート　　　　モルタル吹付け」のようなタイトルがあり、
// 末尾が構造物種類名と一致することを実データ34件で確認済み。IMS設定シートの
// 対応表（点検対象項目→様式シート名）には依存せず自己記述的に判定する
// ことで、シート順が入れ替わっても壊れないようにしている。
function findActiveChecklistSheet(wb: WorkBook, structureType: string | null): { name: string; ws: WorkSheet } | null {
  if (!structureType) return null;
  const candidates = wb.SheetNames.filter((n) => n.trim().startsWith("様式"));
  for (const name of candidates) {
    const ws = wb.Sheets[name];
    const title = cellText(ws, 0, 1); // B1
    if (title && title.trim().endsWith(structureType.trim())) {
      return { name, ws };
    }
  }
  return null;
}

export async function parseSlopeStructureInspectionExcel(
  buffer: Buffer,
  fileName: string
): Promise<SlopeStructureInspectionData | null> {
  const wb: WorkBook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellStyles: true });
  const tenkenHyo = findSheet(wb, "点検表");
  if (!tenkenHyo) return null;
  const ws = tenkenHyo.ws;

  const managementNo = cellText(ws, 1, 7); // H2
  const structureType = cellText(ws, 1, 24); // Y2
  const { latitude, longitude } = extractLatLng(ws);

  const geologyDescription = cellText(ws, 29, 1); // B30
  const summaryComment = cellText(ws, 34, 1); // B35
  const inspectionFindings = cellText(ws, 57, 1); // B58
  const dailyInspectionPoints = cellText(ws, 57, 44); // AS58

  const sheets: SlopeStructureInspectionSheetData[] = [
    { sheetName: tenkenHyo.name, label: "点検表", grid: extractSheetGrid(ws, tenkenHyo.name) },
  ];
  const photos: SlopeStructureInspectionPhotoData[] = [...(await extractTenkenHyoPhotos(buffer, tenkenHyo.name, ws))];

  const active = findActiveChecklistSheet(wb, structureType);
  if (active) {
    sheets.push({
      sheetName: active.name,
      label: `点検チェックシート（${structureType}）`,
      grid: extractSheetGrid(active.ws, active.name),
    });
    photos.push(...(await extractChecklistPhotos(buffer, active.name, active.ws)));
  }

  return {
    managementNo,
    structureType,
    managerOrgName: cellText(ws, 2, 7), // H3
    routeName: cellText(ws, 3, 13), // N4
    location: [cellText(ws, 5, 13), cellText(ws, 5, 21)].filter(Boolean).join(""), // N6 + V6
    distanceMarkFrom: cellText(ws, 4, 13), // N5
    distanceMarkTo: cellText(ws, 4, 27), // AB5
    latitude,
    longitude,
    inspectionDate: cellDate(ws, 1, 36), // AK2
    photoDate: cellDate(ws, 33, 64), // BM34
    weather: cellText(ws, 33, 75), // BX34
    structureScore: cellNumber(ws, 39, 10), // K40
    groundScore: cellNumber(ws, 40, 10), // K41
    overallJudgment: cellText(ws, 41, 15), // P42
    geologyDescription,
    summaryComment,
    inspectionFindings,
    dailyInspectionPoints,
    sheets,
    photos,
  };
}
