// xlsxの指定シート・指定セル範囲を、LibreOfficeで変換したPNGの中から
// 切り出すための位置計算（元のxlsxファイル自体は一切書き換えない）。
//
// 【経緯・なぜPrint_Area／pageSetupの書き換え方式をやめたか】
// 当初は`xl/workbook.xml`のPrint_Areaと対象シートの`pageSetup`（用紙サイズ・
// scale・fitToWidth/fitToHeight）をXML直接編集で書き換え、「印刷範囲だけを
// 1ページで出力させる」方式を試みた。しかし実機（Cloud Run）で検証した結果、
// LibreOfficeのxlsxインポートは`--convert-to`（ヘッドレス変換）経由では
// pageSetupのscale・fitToWidth/fitToHeightを一切反映しない（Print_Areaによる
// 範囲の絞り込み自体は効くが、1ページに収まるようにはならず、印刷範囲が
// 17ページ前後に分割されてしまう）ことを確認した。
//
// 一方、calc_pdf_ExportフィルタのFilterDataオプション`SinglePageSheets`
// （各シートを強制的にPDF1ページへ収める）は効くことを確認したが、これは
// Print_Areaを無視して「シート全体」を1ページに収めてしまう（ヘッダーの
// 管理機関名や下部のチェック表まで写り込む）ため、これ単体では狙った範囲を
// 切り出せない。
//
// そこで方針を変更し、SinglePageSheetsで「シート全体を1ページのPNG」として
// 出力させた上で、対象範囲がシート全体の中でどの位置・大きさを占めるかを
// 列幅（<cols>）・行の高さ（<row ht=>）から比率計算し、ImageMagickの
// `-crop`でその位置を切り出す方式にした（server.js参照）。列幅は文字幅単位、
// 行の高さはpt単位で単位が異なりそのままでは比較できないが、「シート全体に
// 対する比率」としてはどちらも「全体に対する対象範囲の割合」という
// スケール非依存の値になるため、SinglePageSheetsが内部でどれだけ縮小したか
// を知らなくても正しく計算できる。
//
// この方式に切り替えたことで、xlsxファイル自体の書き換えが一切不要になった
// （読み取るだけ）。書き換えによる破損リスクが無くなる副次的な利点もある。

const JSZip = require("jszip");

// ワークブック内でシート名からシートXMLファイルパスと、SinglePageSheets出力での
// ページ番号（非表示シートを除いた並び順。0始まり）を求める。
async function resolveSheet(zip, sheetName) {
  const workbookXml = await zip.file("xl/workbook.xml").async("string");

  const sheetTags = workbookXml.match(/<sheet\b[^>]*\/>/g) || [];
  let sheetRid = null;
  let localSheetId = -1;
  for (let i = 0; i < sheetTags.length; i++) {
    const nameMatch = sheetTags[i].match(/name="([^"]*)"/);
    if (nameMatch && nameMatch[1] === sheetName) {
      const ridMatch = sheetTags[i].match(/r:id="([^"]*)"/);
      sheetRid = ridMatch ? ridMatch[1] : null;
      localSheetId = i;
      break;
    }
  }
  if (!sheetRid) throw new Error(`シート「${sheetName}」が見つかりません`);

  const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const relTags = workbookRelsXml.match(/<Relationship\b[^>]*\/>/g) || [];
  let sheetTarget = null;
  for (const tag of relTags) {
    const idMatch = tag.match(/Id="([^"]*)"/);
    if (idMatch && idMatch[1] === sheetRid) {
      const targetMatch = tag.match(/Target="([^"]*)"/);
      sheetTarget = targetMatch ? targetMatch[1] : null;
      break;
    }
  }
  if (!sheetTarget) throw new Error(`シート「${sheetName}」のパスが解決できません`);

  const sheetPath = `xl/${sheetTarget.replace(/^\.?\/?/, "")}`;

  // SinglePageSheets指定でのPDF出力は、非表示（hidden/veryHidden）シートを除いた
  // 「見えているシート」だけを、ワークブック内の並び順どおりに1シート1ページとして
  // 出力する（実機検証で確認済み。防災カルテのExcelにはドロップダウン用のリスト
  // 参照シート「List」が非表示で挟まっており、これを数えてしまうとページ番号が
  // ずれる）。
  let pdfPageIndex = 0;
  for (let i = 0; i < localSheetId; i++) {
    const stateMatch = sheetTags[i].match(/state="([^"]*)"/);
    const isHidden = stateMatch && (stateMatch[1] === "hidden" || stateMatch[1] === "veryHidden");
    if (!isHidden) pdfPageIndex++;
  }

  return { sheetPath, pdfPageIndex };
}

const DEFAULT_COL_WIDTH = 8.43; // Excelの一般的な既定値（<sheetFormatPr defaultColWidth>が無い場合のフォールバック）
const DEFAULT_ROW_HEIGHT = 15; // pt（同上のdefaultRowHeight相当のフォールバック）

function colToNum(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n; // A=1
}

function parseA1Ref(ref) {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`不正なセル参照です: ${ref}`);
  return { col: colToNum(m[1]), row: Number(m[2]) };
}

// <cols><col min max width .../></cols>から、列番号（1始まり）ごとの幅を
// 引けるようにする。範囲外（<cols>に無い列）はdefaultColWidthを使う。
function buildColWidthLookup(sheetXml, defaultColWidth) {
  const colsMatch = sheetXml.match(/<cols>([^]*?)<\/cols>/);
  const buckets = [];
  if (colsMatch) {
    const colTags = colsMatch[1].match(/<col\b[^>]*\/>/g) || [];
    for (const tag of colTags) {
      const min = Number((tag.match(/min="(\d+)"/) || [])[1]);
      const max = Number((tag.match(/max="(\d+)"/) || [])[1]);
      const width = Number((tag.match(/width="([\d.]+)"/) || [])[1]);
      if (min && max && !Number.isNaN(width)) buckets.push({ min, max, width });
    }
  }
  return (colNum) => {
    for (const b of buckets) {
      if (colNum >= b.min && colNum <= b.max) return b.width;
    }
    return defaultColWidth;
  };
}

// <row r= ht=>から、行番号（1始まり）ごとの高さ（pt）を引けるようにする。
// タグが無い行（完全に空の行）はdefaultRowHeightを使う。
function buildRowHeightLookup(sheetXml, defaultRowHeight) {
  const rowTags = sheetXml.match(/<row\b[^>]*?(?:\/>|>)/g) || [];
  const heights = new Map();
  for (const tag of rowTags) {
    const r = Number((tag.match(/\br="(\d+)"/) || [])[1]);
    const ht = Number((tag.match(/\bht="([\d.]+)"/) || [])[1]);
    if (r && !Number.isNaN(ht)) heights.set(r, ht);
  }
  return (rowNum) => (heights.has(rowNum) ? heights.get(rowNum) : defaultRowHeight);
}

function sumRange(lookup, from, to) {
  let sum = 0;
  for (let i = from; i <= to; i++) sum += lookup(i);
  return sum;
}

// SinglePageSheetsでシート全体を1ページに収めて出力したPNGの中で、指定範囲
// （例: "B6:CL30"）が占める位置・大きさを、シート全体に対する比率
// （0〜1、上下左右の順にoffset+sizeで表現）として計算する。
// 列幅・行の高さの単位が異なっていても、「全体に対する割合」という
// スケール非依存の値として扱うため、正しく比較できる（printArea.js先頭の
// コメント参照）。
function computeRangeFractions(sheetXml, range) {
  const [fromRef, toRef] = range.split(":");
  const from = parseA1Ref(fromRef);
  const to = parseA1Ref(toRef || fromRef);

  const dimMatch = sheetXml.match(/<dimension ref="[^:"]*:([A-Z]+)(\d+)"/);
  const dimMaxCol = dimMatch ? colToNum(dimMatch[1]) : to.col;
  const dimMaxRow = dimMatch ? Number(dimMatch[2]) : to.row;

  // 対象範囲がシートの使用範囲（<dimension>）よりわずかに広い場合
  // （固定範囲に安全マージンを持たせているため。lib/excel/emf-convert.tsの
  // FORM_A_RANGE/FORM_B_RANGE参照）に備え、比率計算の母数は両者の大きい方にする。
  const totalCols = Math.max(dimMaxCol, to.col);
  const totalRows = Math.max(dimMaxRow, to.row);

  const sheetFormatPr = sheetXml.match(/<sheetFormatPr\b[^>]*\/>/);
  const defaultColWidth = sheetFormatPr
    ? Number((sheetFormatPr[0].match(/defaultColWidth="([\d.]+)"/) || [])[1]) || DEFAULT_COL_WIDTH
    : DEFAULT_COL_WIDTH;
  const defaultRowHeight = sheetFormatPr
    ? Number((sheetFormatPr[0].match(/defaultRowHeight="([\d.]+)"/) || [])[1]) || DEFAULT_ROW_HEIGHT
    : DEFAULT_ROW_HEIGHT;

  const colWidth = buildColWidthLookup(sheetXml, defaultColWidth);
  const rowHeight = buildRowHeightLookup(sheetXml, defaultRowHeight);

  const totalWidth = sumRange(colWidth, 1, totalCols);
  const totalHeight = sumRange(rowHeight, 1, totalRows);

  const offsetXFraction = sumRange(colWidth, 1, from.col - 1) / totalWidth;
  const widthFraction = sumRange(colWidth, from.col, to.col) / totalWidth;
  const offsetYFraction = sumRange(rowHeight, 1, from.row - 1) / totalHeight;
  const heightFraction = sumRange(rowHeight, from.row, to.row) / totalHeight;

  return { offsetXFraction, offsetYFraction, widthFraction, heightFraction };
}

// シートのページ余白（<pageMargins>。単位はインチ）を取得する。実機検証で、
// SinglePageSheets指定で1ページに収めた場合でも、この余白（特に上余白）は
// そのまま保持されることを確認した。行・列の比率だけで切り出し位置を計算すると、
// この余白の分だけ実際の内容より上（左）にずれてしまうため、切り出し位置の
// 計算にはこの余白を別途加味する必要がある（server.js参照）。
function getPageMarginsInches(sheetXml) {
  const tag = sheetXml.match(/<pageMargins\b[^>]*\/>/);
  const num = (name) => (tag ? Number((tag[0].match(new RegExp(`${name}="([\\d.]+)"`)) || [])[1]) || 0 : 0);
  return { left: num("left"), right: num("right"), top: num("top"), bottom: num("bottom") };
}

// 与えられたxlsxバイト列（読み取りのみ、変更しない）から、対象シート・対象範囲を
// 切り出すために必要な情報（PDF出力後のページ番号・切り出し位置の比率・ページ余白）を返す。
async function computeRangeCropInfo(xlsxBuffer, sheetName, range) {
  const zip = await JSZip.loadAsync(xlsxBuffer);
  const { sheetPath, pdfPageIndex } = await resolveSheet(zip, sheetName);
  const sheetXml = await zip.file(sheetPath).async("string");
  const fractions = computeRangeFractions(sheetXml, range);
  const marginsIn = getPageMarginsInches(sheetXml);
  return { pdfPageIndex, ...fractions, marginsIn };
}

module.exports = { computeRangeCropInfo };
