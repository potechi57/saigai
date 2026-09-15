import type { WorkSheet } from "xlsx";
import { utils } from "xlsx";

// Excelシートのセル値・結合範囲・列幅・行高を、個々の項目をDB列化せずに
// そのままJSON化するための汎用ユーティリティ（会話ログ「汎用テーブル表示で
// 再現（推奨）」参照）。
//
// 橋梁台帳Excelの「橋梁台帳」シートのように、490箇所を超えるセル結合を持つ
// 非常に密な構造設計・数量計算の帳票を、点検調書と同じ「1項目=1DB列＋
// 忠実なCSSレイアウト」で作り込むと開発コストが膨大になる一方、これらは
// 道路防災管理という本来の目的に対して使用頻度の低いデータであるため、
// セル単位のグリッドデータをそのまま保持し、表示時にcomponents/ExcelSheetGrid.tsx
// で汎用的にHTML表として見た目だけ忠実に再現する方針にした。個別項目の
// 検索・編集はできないが、密な帳票を人が参照する用途には十分であり、
// 将来別の密な帳票（例:トンネル台帳・法面台帳）が来てもスキーマ変更なしで
// 対応できる（BridgeLedgerSheet.grid参照）。
//
// 【列幅について】橋梁台帳Excelは、実データを確認したところ列の実体幅を
// 一律の細かいデフォルト値（defaultColWidth。1〜2文字程度）にそろえ、
// セル結合で見た目の欄幅を作る設計だった（テンプレート作成でよく使われる
// 手法）。そのため列ごとの個別width指定はほぼ無いが、SheetJSは
// `{cellStyles: true}`オプションを付けないと!cols/!rowsを返さない点に注意
// （オプション無しだと空配列になる。実データで確認済み）。

export type ExtractedGridMerge = { r1: number; c1: number; r2: number; c2: number };
export type ExtractedGridCell = { r: number; c: number; text: string };

export type ExtractedGrid = {
  sheetName: string;
  maxRow: number; // 0始まり、シートの実データ範囲の最終行
  maxCol: number; // 0始まり、シートの実データ範囲の最終列
  colWidthsPx: number[]; // 長さ maxCol+1。列ごとの幅(px)
  rowHeightsPx: number[]; // 長さ maxRow+1。行ごとの高さ(px)
  merges: ExtractedGridMerge[];
  cells: ExtractedGridCell[]; // 値のあるセルのみ
};

const DEFAULT_COL_WIDTH_PX = 20;
const DEFAULT_ROW_HEIGHT_PX = 18;

// ワークブック読込時、xlsx.read(buffer, { cellStyles: true, ... }) のように
// cellStyles:trueを指定した状態のWorkSheetを渡すこと（!cols/!rowsの取得に必要）。
export function extractSheetGrid(ws: WorkSheet, sheetName: string): ExtractedGrid {
  const ref = ws["!ref"];
  const range = ref ? utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const maxRow = range.e.r;
  const maxCol = range.e.c;

  const rawCols = (ws["!cols"] ?? []) as ({ wpx?: number } | null | undefined)[];
  const rawRows = (ws["!rows"] ?? []) as ({ hpx?: number } | null | undefined)[];

  const colWidthsPx: number[] = [];
  for (let c = 0; c <= maxCol; c++) {
    colWidthsPx.push(rawCols[c]?.wpx ?? DEFAULT_COL_WIDTH_PX);
  }
  const rowHeightsPx: number[] = [];
  for (let r = 0; r <= maxRow; r++) {
    rowHeightsPx.push(rawRows[r]?.hpx ?? DEFAULT_ROW_HEIGHT_PX);
  }

  const merges: ExtractedGridMerge[] = ((ws["!merges"] ?? []) as { s: { r: number; c: number }; e: { r: number; c: number } }[]).map(
    (m) => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c })
  );

  const cells: ExtractedGridCell[] = [];
  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const addr = utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell?.v === undefined || cell.v === null) continue;
      // 日付・数値セルは、cell.v（JSのDate/number）をそのまま文字列化すると
      // 「Wed Oct 01 1969 09:00:00 GMT+0900 (日本標準時)」のような、元Excelの
      // 見た目と全く異なる表示になってしまう（実データ「橋梁台帳」シートの
      // 竣工年セルで確認済み）。cell.w（SheetJSがセルの表示形式=numFmtを
      // 適用して計算済みの表示用文字列。Excelで実際に見えている文字列と一致する）
      // があればそちらを優先する（この汎用グリッド表示は個別項目の意味を
      // 解釈しないため、Excel上の見た目をそのまま出すのが最も忠実。日付の
      // 妥当性チェックはBridgeLedger本体側の構造化項目でのみ行う。
      // lib/excel/bridge-ledger-import.tsのcellDateJapaneseOrNull参照）。
      const text = (cell.w ?? String(cell.v)).trim();
      if (text === "") continue;
      cells.push({ r, c, text });
    }
  }

  return { sheetName, maxRow, maxCol, colWidthsPx, rowHeightsPx, merges, cells };
}
