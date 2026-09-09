import * as XLSX from "xlsx";

// 様式Ａシートの「点検地点位置図・現況写真」欄に埋め込まれた画像（写真）を抽出する。
//
// xlsx（SheetJS Community Edition）の通常API（XLSX.read()で得られるWorkBook）は
// 埋め込み画像を保持しない。.xlsxの実体はZIPであり、xlsxパッケージが内部で使う
// CFBモジュール（本来はOLE複合文書用だが、ZIPも同じインターフェースで読める）で
// 生バッファから直接開けることを確認済みのため、これを使ってxl/drawings・xl/media
// を辿り画像バイナリを取り出す（新規の依存ライブラリは追加していない）。
//
// 【対象】様式ＡシートのdrawingにひもづくJPEG/PNG/GIF/BMP/WEBPのみ。
// 【対象外（実データで確認した上での判断）】
//   - ベクター形式（EMF/WMF）: ブラウザで直接表示できないため対象外にしている。
//     実データでは様式Ａの「点検地点位置図」にスケッチ画像がEMF形式で埋め込まれて
//     いることを確認したが、変換には別途重いライブラリが必要なため見送っている。
//   - 様式Ｂ・様式Ｄ・「R7現状記録写真」等、様式Ａ以外のシートに埋め込まれた画像。
//     様式Ｂは点検対象ごとの写真だが、現状Excel取込では点検対象を1件の
//     プレースホルダとしてしか作らないため、様式Ｂのシート数に応じて複数の
//     点検対象を自動作成する対応が別途必要（今回はスコープ外、様式Ａの写真のみ）。
//   - .xls（レガシーBIFF8形式）: ZIP構造ではないため、この抽出方法は使えない
//     （xl/workbook.xmlが見つからず、その時点で空配列を返す。写真は従来どおり
//     手動アップロードで補ってもらう）。
export type ExtractedImage = { data: Buffer; ext: string };

const FORM_A_SHEET_NAME = "様式Ａ";
const RASTER_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp"]);

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

export function extractFormAImages(buffer: Buffer): ExtractedImage[] {
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
      if (attr(tag, "name") === FORM_A_SHEET_NAME) {
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
    if (!drawingRelsXml) return [];

    const images: ExtractedImage[] = [];
    for (const tag of tags(drawingRelsXml, "Relationship")) {
      const type = attr(tag, "Type") || "";
      if (!type.includes("/image")) continue;
      const target = attr(tag, "Target");
      if (!target) continue;
      const mediaPath = resolveRelative(drawingPath, target);
      const ext = (mediaPath.split(".").pop() || "").toLowerCase();
      if (!RASTER_EXTENSIONS.has(ext)) continue; // EMF/WMF等はここで除外
      const data = getBin(mediaPath);
      if (data) images.push({ data, ext: ext === "jpg" ? "jpeg" : ext });
    }
    return images;
  } catch {
    // 画像抽出はベストエフォート。失敗してもExcel取込本体には影響させない。
    return [];
  }
}
