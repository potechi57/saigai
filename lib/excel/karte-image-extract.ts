import * as XLSX from "xlsx";
import {
  convertEmfToPng,
  convertSheetRangeToPng,
  hasEmfConverterCredentials,
  FORM_A_RANGE,
  FORM_A_SKETCH_RANGE_END_COL_0INDEXED,
  FORM_B_RANGE,
  FORM_B_SKETCH_RANGE_END_COL_0INDEXED,
} from "@/lib/excel/emf-convert";

// 指定したシートに埋め込まれた画像（写真）を抽出する共通処理。
// 様式Ａの「点検地点位置図・現況写真」欄、様式Ｂの「詳細スケッチ欄・写真張付欄」で使う。
//
// xlsx（SheetJS Community Edition）の通常API（XLSX.read()で得られるWorkBook）は
// 埋め込み画像を保持しない。.xlsxの実体はZIPであり、xlsxパッケージが内部で使う
// CFBモジュール（本来はOLE複合文書用だが、ZIPも同じインターフェースで読める）で
// 生バッファから直接開けることを確認済みのため、これを使ってxl/drawings・xl/media
// を辿り画像バイナリを取り出す（新規の依存ライブラリは追加していない）。
//
// 【対象】指定シートのdrawingにひもづくJPEG/PNG/GIF/BMP/WEBP、およびEMF/WMF
//   （自前のCloud Run変換サービス経由でPNGに変換できた場合のみ。lib/excel/emf-convert.ts参照）。
// 【対象外】
//   - EMF/WMFのうち、Cloud Run変換サービスの環境変数が未設定、または変換に
//     失敗したもの: 従来どおり黙ってスキップする（ベストエフォート）。
//   - 「R7現状記録写真」等、様式Ａ・様式Ｂ以外のシートに埋め込まれた画像は今のところ対象外。
//   - .xls（レガシーBIFF8形式）: ZIP構造ではないため、この抽出方法は使えない
//     （xl/workbook.xmlが見つからず、その時点で空配列を返す。写真は従来どおり
//     手動アップロードで補ってもらう）。
export type ExtractedImage = {
  data: Buffer;
  ext: string;
  // アンカー（貼り付け位置）のセル座標。呼び出し側で並び順を決めるのに使う
  // （様式Ｂは左に2枚縦並び・右に大きめ1枚、という配置を実データで確認済みで、
  // 列→行の順にソートすると自然にその並びになる）。
  fromCol: number;
  fromRow: number;
};

const RASTER_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp"]);
const VECTOR_EXTENSIONS = new Set(["emf", "wmf"]);

function colToNum(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n; // A=1
}

function parseA1Ref(ref: string): { col: number; row: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`不正なセル参照です: ${ref}`);
  return { col: colToNum(m[1]), row: Number(m[2]) };
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(name.replace(/:/g, "\\:") + '="([^"]*)"');
  const m = tag.match(re);
  return m ? m[1] : null;
}

// 属性の並び順に依存しないよう、タグ全体を切り出してから個別に属性を取り出す方式にしている
// （実データで属性順が想定と違うケースに備える）。
function tags(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[^>]*/?>`, "g");
  return xml.match(re) || [];
}

// 例: base="xl/worksheets/sheet1.xml", relative="../drawings/drawing1.xml" → "xl/drawings/drawing1.xml"
function resolveRelative(basePath: string, relativeTarget: string): string {
  const baseDir = basePath.split("/").slice(0, -1);
  for (const part of relativeTarget.split("/")) {
    if (part === "..") baseDir.pop();
    else if (part !== ".") baseDir.push(part);
  }
  return baseDir.join("/");
}

// EMF/WMFのクラウド変換（ネットワークI/O）を伴いうるためasyncにしている
// （呼び出し側は全てlib/actions/import-actions.tsの中の既にasync/awaitな処理）。
export async function extractSheetImages(buffer: Buffer, sheetName: string): Promise<ExtractedImage[]> {
  try {
    const cfb = XLSX.CFB.read(buffer, { type: "buffer" });

    const getText = (path: string): string | null => {
      const entry = XLSX.CFB.find(cfb, "Root Entry/" + path);
      if (!entry || entry.content == null) return null;
      return Buffer.isBuffer(entry.content) ? entry.content.toString("utf8") : String(entry.content);
    };
    const getBin = (path: string): Buffer | null => {
      const entry = XLSX.CFB.find(cfb, "Root Entry/" + path);
      if (!entry || entry.content == null) return null;
      return Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
    };

    // .xls（BIFF8）等、xlsx(zip)形式でない場合はここでnullになり空配列を返す。
    const workbookXml = getText("xl/workbook.xml");
    if (!workbookXml) return [];

    let sheetRid: string | null = null;
    for (const tag of tags(workbookXml, "sheet")) {
      if (attr(tag, "name") === sheetName) {
        sheetRid = attr(tag, "r:id");
        break;
      }
    }
    if (!sheetRid) return [];

    const workbookRelsXml = getText("xl/_rels/workbook.xml.rels");
    if (!workbookRelsXml) return [];
    let sheetPath: string | null = null;
    for (const tag of tags(workbookRelsXml, "Relationship")) {
      if (attr(tag, "Id") === sheetRid) {
        const target = attr(tag, "Target");
        sheetPath = target ? resolveRelative("xl/workbook.xml", target) : null;
        break;
      }
    }
    if (!sheetPath) return [];

    const sheetFileName = sheetPath.split("/").pop()!;
    const sheetRelsPath = resolveRelative(sheetPath, `_rels/${sheetFileName}.rels`);
    const sheetRelsXml = getText(sheetRelsPath);
    if (!sheetRelsXml) return [];

    let drawingPath: string | null = null;
    for (const tag of tags(sheetRelsXml, "Relationship")) {
      const type = attr(tag, "Type") || "";
      if (type.includes("/drawing")) {
        const target = attr(tag, "Target");
        drawingPath = target ? resolveRelative(sheetPath, target) : null;
        break;
      }
    }
    if (!drawingPath) return [];

    const drawingFileName = drawingPath.split("/").pop()!;
    const drawingRelsPath = resolveRelative(drawingPath, `_rels/${drawingFileName}.rels`);
    const drawingRelsXml = getText(drawingRelsPath);
    const drawingXml = getText(drawingPath);
    if (!drawingRelsXml || !drawingXml) return [];

    // rId -> メディアファイルパス
    const mediaByRid = new Map<string, string>();
    for (const tag of tags(drawingRelsXml, "Relationship")) {
      const type = attr(tag, "Type") || "";
      if (!type.includes("/image")) continue;
      const target = attr(tag, "Target");
      if (!target) continue;
      const id = attr(tag, "Id");
      if (id) mediaByRid.set(id, resolveRelative(drawingPath, target));
    }

    // EMF/WMFの変換はCloud Run変換サービスへの通信を伴うため、環境変数が無い環境では
    // 最初から試行しない（従来どおりEMF/WMFは無視する）。
    const canConvertVector = hasEmfConverterCredentials();

    // 各アンカー（<xdr:twoCellAnchor>等）から、貼り付け位置（from列・行）と
    // 参照している画像（r:embed）を取り出す。
    const anchorBlocks = drawingXml.match(/<xdr:(?:two|one)CellAnchor\b[^]*?<\/xdr:(?:two|one)CellAnchor>/g) || [];
    const images: ExtractedImage[] = [];
    for (const block of anchorBlocks) {
      const embedMatch = block.match(/r:embed="(rId\d+)"/);
      if (!embedMatch) continue; // 画像を持たないアンカー（図形・矢印等）はスキップ
      const mediaPath = mediaByRid.get(embedMatch[1]);
      if (!mediaPath) continue;
      const ext = (mediaPath.split(".").pop() || "").toLowerCase();
      if (!RASTER_EXTENSIONS.has(ext) && !VECTOR_EXTENSIONS.has(ext)) continue; // それ以外の形式は対象外

      const fromMatch = block.match(/<xdr:from>\s*<xdr:col>(\d+)<\/xdr:col>[^]*?<xdr:row>(\d+)<\/xdr:row>/);
      const fromCol = fromMatch ? Number(fromMatch[1]) : 0;
      const fromRow = fromMatch ? Number(fromMatch[2]) : 0;

      const data = getBin(mediaPath);
      if (!data) continue;

      if (RASTER_EXTENSIONS.has(ext)) {
        images.push({ data, ext: ext === "jpg" ? "jpeg" : ext, fromCol, fromRow });
        continue;
      }

      // ここに来るのはEMF/WMF。認証情報が無い、またはAPI呼び出しに失敗した場合は
      // 従来どおり黙ってスキップする（ベストエフォート。lib/excel/emf-convert.ts参照）。
      if (!canConvertVector) continue;
      const png = await convertEmfToPng(data, ext as "emf" | "wmf");
      if (png) images.push({ data: png, ext: "png", fromCol, fromRow });
    }

    // 列→行の順に並べる。様式Ｂは左（列が小さい）に2枚縦並び・右（列が大きい）に
    // 大きめ1枚という配置を実データ複数件で確認済みのため、この並びで
    // 「左上→左下→右」の順になる。
    images.sort((a, b) => a.fromCol - b.fromCol || a.fromRow - b.fromRow);
    return images;
  } catch {
    // 画像抽出はベストエフォート。失敗してもExcel取込本体には影響させない。
    return [];
  }
}

// シートに宣言されているPrint_Area（印刷範囲）を0始まりの列・行番号で返す。
// 見つからない場合（Print_Area未設定・解析失敗等）はnull。
//
// 【なぜ必要か】実データ（様式Ｂ④）で、印刷範囲の右外側に古い図形の残骸と
// 見られる写真が取り残されているケースが見つかった。個別抽出（extractSheetImages）
// は貼り付け位置に関わらず全ての画像を拾うため、そのままでは印刷範囲外の
// 無関係な写真まで「写真張付欄」の一部として取り込んでしまう。この範囲を使い、
// extractFormAImages/extractFormBImagesで印刷範囲外の画像を除外する
// （services/emf-converter/printArea.jsのgetSheetAnchorExtentも参照。あちらは
// 逆に「印刷範囲外の図形が合成画像の切り出し位置をずらす」不具合の対策）。
function getPrintAreaBounds0Indexed(
  buffer: Buffer,
  sheetName: string
): { startCol0: number; startRow0: number; endCol0: number; endRow0: number } | null {
  try {
    const cfb = XLSX.CFB.read(buffer, { type: "buffer" });
    const getText = (path: string): string | null => {
      const entry = XLSX.CFB.find(cfb, "Root Entry/" + path);
      if (!entry || entry.content == null) return null;
      return Buffer.isBuffer(entry.content) ? entry.content.toString("utf8") : String(entry.content);
    };

    const workbookXml = getText("xl/workbook.xml");
    if (!workbookXml) return null;

    let localSheetId = -1;
    const sheetTags = tags(workbookXml, "sheet");
    for (let i = 0; i < sheetTags.length; i++) {
      if (attr(sheetTags[i], "name") === sheetName) {
        localSheetId = i;
        break;
      }
    }
    if (localSheetId < 0) return null;

    const printAreaMatch = workbookXml.match(
      new RegExp(`<definedName name="_xlnm\\.Print_Area" localSheetId="${localSheetId}">([^<]*)</definedName>`)
    );
    if (!printAreaMatch) return null;

    // 例:「様式Ｂ④!$B$2:$CJ$43」からセル範囲部分だけを取り出す。
    const rangeMatch = printAreaMatch[1].match(/!(\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)$/);
    if (!rangeMatch) return null;
    const range = rangeMatch[1].replace(/\$/g, "");
    const [fromRef, toRef] = range.split(":");
    const from = parseA1Ref(fromRef);
    const to = parseA1Ref(toRef || fromRef);

    return { startCol0: from.col - 1, startRow0: from.row - 1, endCol0: to.col - 1, endRow0: to.row - 1 };
  } catch {
    return null;
  }
}

// 指定シートの固定範囲（FORM_A_RANGE/FORM_B_RANGE）を1枚のPNGとして取り込む。
// 新規・再取込を問わず毎回試行する（lib/actions/import-actions.tsのresolveFormAImages/
// resolveFormBImages参照。会話ログ参照）。Cloud Run変換サービスが未設定・応答失敗等の
// 場合はnullを返し、呼び出し側で従来のextractSheetImages（個別写真抽出）にフォールバックする。
export async function extractFormRangeImage(
  buffer: Buffer,
  sheetName: string,
  range: string
): Promise<ExtractedImage | null> {
  if (!hasEmfConverterCredentials()) return null;
  try {
    const result = await convertSheetRangeToPng(buffer, sheetName, range);
    if (!result) return null;
    // Cloud Run側（services/emf-converter/server.js）がPNG/JPEGのうちサイズが
    // 小さい方を都度選んで返すため、実際の形式（result.ext）をそのまま使う
    // （会話ログ・engineering-lessons-learned.md参照）。
    return { data: result.data, ext: result.ext, fromCol: 0, fromRow: 0 };
  } catch {
    return null;
  }
}

// 様式Ｂ専用: 「詳細スケッチ欄」（FORM_B_RANGE）だけをまとめて1枚のPNGに変換し、
// 「写真張り付け欄」（詳細スケッチ欄より右側）の写真は従来どおり個別に抜き出して
// 後ろに続ける。写真張り付け欄はほとんどの場合、図形・注記テキストが重ねて
// 配置されていないことを実データで確認済みのため、まとめて画像化する必要が無く、
// 個別抽出のままの方が（画像が分かれている分）見やすい。
// 新規・再取込を問わず毎回試行する（lib/actions/import-actions.tsのresolveFormBImages
// 参照。会話ログ参照）。合成画像の取得に失敗した場合（Cloud Run変換サービス未設定・
// 応答失敗等）はnullを返し、呼び出し側で従来のextractSheetImages（全画像の個別抽出）に
// フォールバックする。
export async function extractFormBImages(buffer: Buffer, sheetName: string): Promise<ExtractedImage[] | null> {
  const sketchImage = await extractFormRangeImage(buffer, sheetName, FORM_B_RANGE);
  if (!sketchImage) return null;

  const allImages = await extractSheetImages(buffer, sheetName);
  // 印刷範囲外（getPrintAreaBounds0Indexed参照）に取り残された無関係な画像を
  // 「写真張付欄」に含めてしまわないよう、列条件に加えて印刷範囲内かどうかも
  // 見る。印刷範囲が取得できない場合（Print_Area未設定等）は従来どおり列だけで判定する。
  const printArea = getPrintAreaBounds0Indexed(buffer, sheetName);
  const photoAreaImages = allImages.filter((img) => {
    if (img.fromCol <= FORM_B_SKETCH_RANGE_END_COL_0INDEXED) return false;
    if (!printArea) return true;
    return (
      img.fromCol <= printArea.endCol0 && img.fromRow >= printArea.startRow0 && img.fromRow <= printArea.endRow0
    );
  });

  // extractSheetImagesの並び順（列→行）を踏襲するため、合成画像（fromCol=0）は
  // 常に先頭になる。
  return [sketchImage, ...photoAreaImages];
}

// 様式Ａ専用: 「点検地点位置図」欄（FORM_A_RANGE）だけをまとめて1枚のPNGに変換し、
// 「現況写真」欄（点検地点位置図欄より右側。ベクターではない普通の写真が貼られる
// だけで、図形・注記が重なることは無い）の写真は従来どおり個別に抜き出して後ろに
// 続ける。extractFormBImagesと同じ考え方（会話ログ参照）。
// 合成画像の取得に失敗した場合（Cloud Run変換サービス未設定・応答失敗等）はnullを
// 返し、呼び出し側で従来のextractSheetImages（全画像の個別抽出）にフォールバックする。
export async function extractFormAImages(buffer: Buffer): Promise<ExtractedImage[] | null> {
  const sheetName = "様式Ａ";
  const sketchImage = await extractFormRangeImage(buffer, sheetName, FORM_A_RANGE);
  if (!sketchImage) return null;

  const allImages = await extractSheetImages(buffer, sheetName);
  // extractFormBImagesと同じ理由（印刷範囲外に取り残された無関係な画像の除外）。
  const printArea = getPrintAreaBounds0Indexed(buffer, sheetName);
  const photoAreaImages = allImages.filter((img) => {
    if (img.fromCol <= FORM_A_SKETCH_RANGE_END_COL_0INDEXED) return false;
    if (!printArea) return true;
    return (
      img.fromCol <= printArea.endCol0 && img.fromRow >= printArea.startRow0 && img.fromRow <= printArea.endRow0
    );
  });

  return [sketchImage, ...photoAreaImages];
}

export { FORM_A_RANGE, FORM_B_RANGE };
