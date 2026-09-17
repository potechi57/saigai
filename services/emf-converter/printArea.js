// xlsxの指定シート・指定セル範囲を、LibreOfficeで変換したPNGの中から
// 切り出すための位置計算。あわせて、変換前にxlsxへ最小限のパッチ
// （patchWorkbookForFitToPage）を当てる処理もここに置く。
//
// 【経緯・なぜ一度は「Print_Area／pageSetupの書き換え」をやめたか】
// 当初は対象シートの`pageSetup`（scale・fitToWidth/fitToHeight）をXML直接編集で
// 書き換え、「印刷範囲だけを1ページで出力させる」方式を試みたが、実機検証で
// 「pageSetupのfitToWidth/fitToHeightを書き換えても反映されず、印刷範囲が
// 17ページ前後に分割されてしまう」ことを確認し、この方式を断念した。
// 代わりにcalc_pdf_ExportフィルタのFilterDataオプション`SinglePageSheets`
// （各シートを強制的にPDF1ページへ収める）を使い、シート全体を1ページの
// PNGとして出力した上で、対象範囲がシート全体の中で占める位置・大きさを
// 列幅（<cols>）・行の高さ（<row ht=>）から比率計算し、ImageMagickの
// `-crop`で切り出す方式（xlsx自体は書き換えない、読み取り専用）にしていた。
//
// 【SinglePageSheetsをやめてfitToWidth/fitToHeightに戻した理由】
// その後、一部のカルテ（様式Ａ）でSinglePageSheets使用時にPDF変換結果の
// 上半分が白紙になる不具合が見つかり、LibreOffice 7.4以降（Cloud Run本番の
// 7.4.7.2を含む）で再現する、SinglePageSheets機能自体に起因する不具合である
// ことを、複数バージョンのLibreOfficeでの比較実験・styles.xml/cellXfsの
// 切り分け実験を通じて特定した（詳細はプロジェクトルートREADME.md参照）。
//
// この調査の過程で、上記「pageSetupの書き換えが反映されない」という以前の
// 結論が誤りだったことも判明した。原因は、OOXMLの仕様上`fitToWidth`/
// `fitToHeight`は`pageSetup`の属性を書き換えるだけでは有効にならず、
// 別要素`<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`を追加しないと
// 無視される（scaleがそのまま使われる）ため、という、前回の検証時に
// 見落としていた仕様上のトグルが原因だった。この`fitToPage="1"`を正しく
// 追加した上でfitToWidth="1" fitToHeight="1"を設定したところ、
// SinglePageSheetsを使わない素の`--convert-to pdf`でも「印刷範囲を1ページに
// 収める」という本来やりたかった変換が正しく行われ、かつ白紙不具合も
// 再現しないことを実データ複数件・本番と同一のLibreOfficeバイナリで確認した。
//
// そのため、patchWorkbookForFitToPageで対象xlsxの可視シート全員に
// fitToPage="1"・fitToWidth="1"・fitToHeight="1"を（最小限のXML差分で）
// 適用してから変換する方式に変更した。全シートに適用するのは、非表示シートを
// 除いた「シート1つ＝PDF1ページ」という単純な対応関係を維持し、pdfPageIndex
// の計算（resolveSheet参照）を変更せずに済ませるため。
//
// この方式変更後も、対象範囲がシート全体（＝Print_Area）の中で占める位置・
// 大きさを比率で計算し、ImageMagickの`-crop`で切り出すという骨格は変わって
// いない（列幅・行高からの比率計算はレンダリング方式に依存しないため）。
// 変わったのは、切り出し位置の「縦方向の原点」の求め方のみ（下記
// computeRangeCropInfoのコメント参照）。

const JSZip = require("jszip");

// 例: base="xl/worksheets/sheet1.xml", relative="../drawings/drawing1.xml" → "xl/drawings/drawing1.xml"
// karte-image-extract.ts（Next.js側の個別画像抽出）にある同名関数と同じロジック。
function resolveRelative(basePath, relativeTarget) {
  const baseDir = basePath.split("/").slice(0, -1);
  for (const part of relativeTarget.split("/")) {
    if (part === "..") baseDir.pop();
    else if (part !== ".") baseDir.push(part);
  }
  return baseDir.join("/");
}

// シートに配置されている図形（drawing）のうち、最も右・最も下まで達しているものの
// セル座標（1始まり）を求める。見つからない場合はnullを返す。
//
// 【なぜ必要か（様式Ｂ④での不具合）】
// SinglePageSheetsは宣言されたPrint_Areaを基準にシート全体を1ページへ収めるが、
// Print_Areaの範囲より外側（右・下）に図形がはみ出して配置されている場合、
// その図形も同じ1ページの中に収めようとして実際の描画内容がPrint_Areaより
// 広がることがある（実データ「様式Ｂ④」で確認: Print_Areaは$B$2:$CJ$43だが、
// 使われていない古い図形（コピー編集の残骸と見られる）がCJ列より右
// （CQ列付近）に取り残されていた）。この場合、server.js側で画像から検出する
// 内容領域の幅（contentWidthPx）はPrint_Areaの範囲より広い実際の描画内容を
// 反映してしまうため、比率計算の分母（totalWidth/totalHeight、Print_Area基準）
// との間にズレが生じ、切り出し位置が右に大きくズレる（様式Ｂ④の詳細スケッチ欄を
// 画像化すると、右側の写真張付欄まで写り込んでしまっていた）。
// これを防ぐため、Print_Areaだけでなく実際に配置されている図形の最大範囲も
// 基準範囲（total*）に含める。
async function getSheetAnchorExtent(zip, sheetPath) {
  const sheetFileName = sheetPath.split("/").pop();
  const sheetRelsPath = resolveRelative(sheetPath, `_rels/${sheetFileName}.rels`);
  const sheetRelsFile = zip.file(sheetRelsPath);
  if (!sheetRelsFile) return null;
  const sheetRelsXml = await sheetRelsFile.async("string");

  const relTags = sheetRelsXml.match(/<Relationship\b[^>]*\/>/g) || [];
  let drawingPath = null;
  for (const tag of relTags) {
    const type = (tag.match(/Type="([^"]*)"/) || [])[1] || "";
    if (!type.includes("/drawing")) continue;
    const target = (tag.match(/Target="([^"]*)"/) || [])[1];
    if (target) drawingPath = resolveRelative(sheetPath, target);
    break;
  }
  if (!drawingPath) return null;

  const drawingFile = zip.file(drawingPath);
  if (!drawingFile) return null;
  const drawingXml = await drawingFile.async("string");

  const anchorBlocks = drawingXml.match(/<xdr:(?:two|one)CellAnchor\b[^]*?<\/xdr:(?:two|one)CellAnchor>/g) || [];
  let maxCol = 0;
  let maxRow = 0;
  for (const block of anchorBlocks) {
    // oneCellAnchor（<xdr:to>を持たない）は対象外。実データではtwoCellAnchorのみ
    // 確認済みで、写真・図形いずれも<xdr:to>を持つ。
    const toMatch = block.match(/<xdr:to>\s*<xdr:col>(\d+)<\/xdr:col>[^]*?<xdr:row>(\d+)<\/xdr:row>/);
    if (!toMatch) continue;
    // <xdr:col>/<xdr:row>は0始まりのため、1始まりのセル座標に揃える。
    maxCol = Math.max(maxCol, Number(toMatch[1]) + 1);
    maxRow = Math.max(maxRow, Number(toMatch[2]) + 1);
  }
  if (maxCol === 0 && maxRow === 0) return null;
  return { maxCol, maxRow };
}

// ワークブック内でシート名からシートXMLファイルパスと、fitToPage変換後のPDFでの
// ページ番号（非表示シートを除いた並び順。0始まり。全可視シートにfitToPageを
// 適用しているため「シート1つ＝PDF1ページ」となる）、既存のPrint_Area（あれば）を求める。
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

  // このシート向けの既存Print_Area（例:「様式Ａ!$B$2:$CJ$43」）があれば取得する。
  // fitToPage（fitToWidth/fitToHeight）は`<dimension>`（シートの使用セル範囲。
  // フリー図形のはみ出しやExcel側の編集履歴で実態とズレることがある）ではなく、
  // この既存Print_Areaを基準に「印刷範囲」を1ページへ収める（Excel本来の
  // 「1ページに印刷」機能そのものであり、これは仕様上の標準的な挙動）。
  // 比率計算の基準（分母）をdimensionではなくPrint_Areaに合わせないと、行・列の
  // 位置がわずかにずれる（printArea.js全体のコメント参照）。
  let printAreaRange = null;
  const printAreaMatch = workbookXml.match(
    new RegExp(`<definedName name="_xlnm\\.Print_Area" localSheetId="${localSheetId}">([^<]*)</definedName>`)
  );
  if (printAreaMatch) {
    // 例:「様式Ａ!$B$2:$CJ$43」「'様式Ｂ (2)'!$B$2:$CJ$43」からセル範囲部分だけを取り出す。
    const formula = printAreaMatch[1];
    const rangeMatch = formula.match(/!(\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)$/);
    if (rangeMatch) printAreaRange = rangeMatch[1].replace(/\$/g, "");
  }

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

  const anchorExtent = await getSheetAnchorExtent(zip, sheetPath);

  return { sheetPath, pdfPageIndex, printAreaRange, anchorExtent };
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

// fitToPageで印刷範囲を1ページに収めて出力したPNGの中で、指定範囲
// （例: "B6:CL30"）が占める位置・大きさを、基準範囲（printAreaRangeがあれば
// それ、無ければ<dimension>＝シートの使用セル範囲）に対する比率
// （0〜1、上下左右の順にoffset+sizeで表現）として計算する。
// 列幅・行の高さの単位が異なっていても、「基準範囲に対する割合」という
// スケール非依存の値として扱うため、正しく比較できる（printArea.js先頭の
// コメント参照）。
//
// 【基準範囲になぜ<dimension>ではなくPrint_Areaを優先するか】
// fitToPageは`<dimension>`ではなく、シートに既存のPrint_Area定義を基準に
// 「印刷範囲」を1ページへ収める（resolveSheet参照）。`<dimension>`はセルの
// 使用範囲であり、フリー図形のはみ出しやExcel側の編集履歴で実際の印刷結果と
// ズレることがあるため、Print_Areaが存在する場合はそちらを優先する。
//
// 【基準範囲をPrint_Areaより広げることがある理由（anchorExtent）】
// Print_Areaの範囲外（右・下）に図形がはみ出して配置されている場合、
// 実際の描画内容はPrint_Areaより広がることがある（getSheetAnchorExtentの
// コメント・様式Ｂ④の実データ不具合を参照。この不具合はSinglePageSheets時代に
// 見つかったものだが、fitToPageでも印刷範囲外の図形が巻き込まれる構造は
// 変わらないため、引き続き必要な補正として残している）。この場合、
// Print_Area基準の比率のままだと切り出し位置がずれるため、図形の実際の
// 最大範囲（anchorExtent）がPrint_Areaより広ければそちらを基準範囲として
// 採用する。
function computeRangeFractions(sheetXml, range, printAreaRange, anchorExtent) {
  const [fromRef, toRef] = range.split(":");
  const from = parseA1Ref(fromRef);
  const to = parseA1Ref(toRef || fromRef);

  let refStartCol = 1;
  let refStartRow = 1;
  let refEndCol = to.col;
  let refEndRow = to.row;

  if (printAreaRange) {
    const [paFromRef, paToRef] = printAreaRange.split(":");
    const paFrom = parseA1Ref(paFromRef);
    const paTo = parseA1Ref(paToRef || paFromRef);
    refStartCol = paFrom.col;
    refStartRow = paFrom.row;
    refEndCol = paTo.col;
    refEndRow = paTo.row;
  } else {
    const dimMatch = sheetXml.match(/<dimension ref="([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?"/);
    if (dimMatch) {
      refStartCol = colToNum(dimMatch[1]);
      refStartRow = Number(dimMatch[2]);
      refEndCol = dimMatch[3] ? colToNum(dimMatch[3]) : refStartCol;
      refEndRow = dimMatch[4] ? Number(dimMatch[4]) : refStartRow;
    }
  }

  // 対象範囲が基準範囲よりわずかに広い場合（固定範囲に安全マージンを持たせているため。
  // lib/excel/emf-convert.tsのFORM_A_RANGE/FORM_B_RANGE参照）に備え、比率計算の
  // 母数は両者を包含する範囲にする。さらに、Print_Areaの外側まではみ出して
  // 配置されている図形がある場合（上記コメント参照）、その最大範囲も含める。
  const totalStartCol = Math.min(refStartCol, from.col);
  const totalStartRow = Math.min(refStartRow, from.row);
  const totalEndCol = Math.max(refEndCol, to.col, anchorExtent ? anchorExtent.maxCol : 0);
  const totalEndRow = Math.max(refEndRow, to.row, anchorExtent ? anchorExtent.maxRow : 0);

  const sheetFormatPr = sheetXml.match(/<sheetFormatPr\b[^>]*\/>/);
  const defaultColWidth = sheetFormatPr
    ? Number((sheetFormatPr[0].match(/defaultColWidth="([\d.]+)"/) || [])[1]) || DEFAULT_COL_WIDTH
    : DEFAULT_COL_WIDTH;
  const defaultRowHeight = sheetFormatPr
    ? Number((sheetFormatPr[0].match(/defaultRowHeight="([\d.]+)"/) || [])[1]) || DEFAULT_ROW_HEIGHT
    : DEFAULT_ROW_HEIGHT;

  const colWidth = buildColWidthLookup(sheetXml, defaultColWidth);
  const rowHeight = buildRowHeightLookup(sheetXml, defaultRowHeight);

  const totalWidth = sumRange(colWidth, totalStartCol, totalEndCol);
  const totalHeight = sumRange(rowHeight, totalStartRow, totalEndRow);

  const offsetXFraction = sumRange(colWidth, totalStartCol, from.col - 1) / totalWidth;
  const widthFraction = sumRange(colWidth, from.col, to.col) / totalWidth;
  const offsetYFraction = sumRange(rowHeight, totalStartRow, from.row - 1) / totalHeight;
  const heightFraction = sumRange(rowHeight, from.row, to.row) / totalHeight;

  // totalWidth（基準範囲の列幅の合計。文字幅単位）・totalHeight（同、行の高さの
  // 合計。pt単位で正確）も返す。server.js側で、内容領域の高さをトリミング検出
  // ではなく計算で求めるために使う（getPageMarginsInches削除時のコメント・
  // server.js側のコメント参照）。
  return { offsetXFraction, offsetYFraction, widthFraction, heightFraction, totalWidth, totalHeight };
}

// 与えられたxlsxバイト列（読み取りのみ、変更しない）から、対象シート・対象範囲を
// 切り出すために必要な情報（PDF出力後のページ番号・切り出し位置の比率・上余白）を返す。
//
// 【横方向は画像検出、縦方向は上余白からの計算で求める理由】
// 横方向は、罫線が印刷範囲の左右端まで届いていることが実データで一貫していた
// ため、server.js側で実際にレンダリングした画像から内容領域を直接検出する
// （ImageMagickのbounding box検出）方式にしている。
//
// 縦方向は同じ方式を使わない。実データ（B3274A080）で印刷範囲の上部付近に
// 可視要素（罫線・塗りつぶし等）がほとんど無いファイルに遭遇し、その空白を
// 「余白」と誤認識して内容領域を実際より低い位置・小さい高さに検出して
// しまう不具合があったため。かわりに、宣言された<pageMargins top=…>
// （インチ単位）をそのままDPI換算した値を縦方向の原点として使う
// （server.jsのcontentOffsetYPx参照）。以前（SinglePageSheets使用時）は
// これが使えなかった。SinglePageSheetsは宣言されたpageMarginsに加えて
// 「1ページに収める」独自のフィット処理由来の非対称な余白を追加することが
// あり、宣言値だけでは実際の余白を予測できなかったため。fitToPageは
// Excel本来の印刷機能そのものであり、宣言されたpageMarginsをそのまま
// 尊重することを実データで確認済みのため、この方式が使えるようになった。
// 内容領域の高さ自体は、「同じ印刷範囲・列幅・行高を持つファイルなら、
// 内容領域の縦横比は共通のはず」という考えに基づき、横方向の検出結果
// （contentWidthPx）から計算で求める（server.jsのPOINTS_PER_COL_WIDTH_UNIT参照）。
async function computeRangeCropInfo(xlsxBuffer, sheetName, range) {
  const zip = await JSZip.loadAsync(xlsxBuffer);
  const { sheetPath, pdfPageIndex, printAreaRange, anchorExtent } = await resolveSheet(zip, sheetName);
  const sheetXml = await zip.file(sheetPath).async("string");
  const fractions = computeRangeFractions(sheetXml, range, printAreaRange, anchorExtent);
  const topMarginInches = getTopMarginInches(sheetXml);
  return { pdfPageIndex, topMarginInches, ...fractions };
}

const DEFAULT_TOP_MARGIN_INCHES = 0.75; // OOXML既定値（<pageMargins>省略時）

// <pageMargins top="…"> をインチ単位で返す（無ければOOXML既定値）。
function getTopMarginInches(sheetXml) {
  const m = sheetXml.match(/<pageMargins\b[^>]*\/>/);
  if (!m) return DEFAULT_TOP_MARGIN_INCHES;
  const topMatch = m[0].match(/\btop="([\d.]+)"/);
  return topMatch ? Number(topMatch[1]) : DEFAULT_TOP_MARGIN_INCHES;
}

// 【方式】対象xlsxの可視シート全員に対して、fitToWidth/fitToHeightで
// 「印刷範囲を1ページに収める」設定を適用してから変換する（server.js参照）。
// OOXMLの仕様上、`pageSetup`のfitToWidth/fitToHeight属性を書き換えるだけでは
// 有効にならず、別要素`<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`を
// 追加しないと無視される（scaleがそのまま使われる）ため、両方をセットする。
// 全可視シートに適用するのは、resolveSheetのpdfPageIndex計算（非表示シートを
// 除いた並び順＝PDFページ番号）を「シート1つ＝PDF1ページ」という単純な
// 前提のまま維持するため（対象外の一部シートだけfitToPageにすると、その
// シートが複数ページに分かれてしまい、後続シートのページ番号がずれる）。
// 非表示（hidden/veryHidden）シートはPDF出力そのものに含まれないためスキップする。
async function patchWorkbookForFitToPage(xlsxBuffer) {
  const zip = await JSZip.loadAsync(xlsxBuffer);
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");

  const relMap = {};
  for (const tag of workbookRelsXml.match(/<Relationship\b[^>]*\/>/g) || []) {
    const id = tag.match(/Id="([^"]*)"/)[1];
    relMap[id] = tag.match(/Target="([^"]*)"/)[1];
  }

  const sheetTags = workbookXml.match(/<sheet\b[^>]*\/>/g) || [];
  for (const tag of sheetTags) {
    const stateMatch = tag.match(/state="([^"]*)"/);
    const state = stateMatch ? stateMatch[1] : "visible";
    if (state === "hidden" || state === "veryHidden") continue;

    const rid = tag.match(/r:id="([^"]*)"/)[1];
    const target = relMap[rid];
    const sheetPath = "xl/" + target.replace(/^\.?\/?/, "");
    const sheetXml = await zip.file(sheetPath).async("string");
    zip.file(sheetPath, patchSheetXmlForFitToPage(sheetXml));
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// 1シート分のXMLに、fitToPage="1"（sheetPr/pageSetUpPr）と
// fitToWidth="1" fitToHeight="1"（pageSetup）を適用する。既存のscale値等は
// そのまま残す（fitToPage="1"のときは無視されるだけで、害はない）。
function patchSheetXmlForFitToPage(sheetXml) {
  let xml = sheetXml;

  if (!xml.includes("<sheetPr")) {
    xml = xml.replace(/<dimension\b/, '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension');
  } else if (!xml.includes("<pageSetUpPr")) {
    xml = /<sheetPr\s*\/>/.test(xml)
      ? xml.replace(/<sheetPr\s*\/>/, '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
      : xml.replace(/<sheetPr\b([^>]*)>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/>');
  } else {
    const old = xml.match(/<pageSetUpPr\b[^>]*\/>/)[0];
    const neu = old.includes('fitToPage="1"')
      ? old
      : old.includes("fitToPage=")
        ? old.replace(/fitToPage="[^"]*"/, 'fitToPage="1"')
        : old.replace("/>", ' fitToPage="1"/>');
    xml = xml.replace(old, neu);
  }

  const psMatch = xml.match(/<pageSetup\b[^>]*\/>/);
  if (psMatch) {
    let oldPs = psMatch[0];
    let newPs = oldPs.includes("fitToWidth=")
      ? oldPs.replace(/fitToWidth="[^"]*"/, 'fitToWidth="1"')
      : oldPs.replace("/>", ' fitToWidth="1"/>');
    newPs = newPs.includes("fitToHeight=")
      ? newPs.replace(/fitToHeight="[^"]*"/, 'fitToHeight="1"')
      : newPs.replace("/>", ' fitToHeight="1"/>');
    xml = xml.replace(oldPs, newPs);
  } else {
    // pageSetupが無いシート（実データで確認済み: 添付資料用の空きシート等）。
    // CT_Worksheetのスキーマ上、pageSetupはprintOptions/pageMargins（あれば）
    // の直後、headerFooter/rowBreaks/colBreaks（あれば）より前に来る必要がある。
    const newTag = '<pageSetup fitToWidth="1" fitToHeight="1"/>';
    const pmMatch = xml.match(/<pageMargins\b[^>]*\/>/);
    if (pmMatch) {
      const idx = xml.indexOf(pmMatch[0]) + pmMatch[0].length;
      xml = xml.slice(0, idx) + newTag + xml.slice(idx);
    } else {
      const afterMatch = xml.match(/<(headerFooter|rowBreaks|colBreaks)\b/);
      xml = afterMatch
        ? xml.slice(0, afterMatch.index) + newTag + xml.slice(afterMatch.index)
        : xml.replace("</worksheet>", newTag + "</worksheet>");
    }
  }

  return xml;
}

module.exports = { computeRangeCropInfo, patchWorkbookForFitToPage };
