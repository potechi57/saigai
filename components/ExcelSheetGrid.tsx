import type { ExtractedGrid } from "@/lib/excel/excel-grid-extract";

// lib/excel/excel-grid-extract.tsで抽出したセル値・結合・列幅・行高をそのまま
// HTML表として再現する汎用コンポーネント（会話ログ「汎用テーブル表示で再現
// （推奨）」参照）。BridgeLedgerSheet.grid（490箇所超のセル結合を持つ「橋梁台帳」
// シート等）のように、個々の項目をDB列化していない密な帳票を、見た目だけ
// 忠実に再現するために使う。サーバーコンポーネントのまま使えるよう、
// クリック等のインタラクションは持たない（純粋な表示のみ）。
//
// 結合セルはrowSpan/colSpanで表現する。結合範囲に含まれる、左上以外のセルは
// 描画をスキップする必要があるため、行×列の「描画済みマップ」を先に作る
// （HTMLのtableでは、結合されたセルの内側にある他のセルを重ねて描画できない
// ため、この種の変換では標準的なテクニック）。
export default function ExcelSheetGrid({ grid }: { grid: ExtractedGrid }) {
  const { maxRow, maxCol, colWidthsPx, rowHeightsPx, merges, cells } = grid;

  const cellText = new Map<string, string>();
  for (const c of cells) cellText.set(`${c.r},${c.c}`, c.text);

  // 結合範囲の左上セル→スパン数、および結合範囲内（左上以外）のセル座標の集合を作る。
  const spanAt = new Map<string, { rowSpan: number; colSpan: number }>();
  const covered = new Set<string>();
  for (const m of merges) {
    spanAt.set(`${m.r1},${m.c1}`, { rowSpan: m.r2 - m.r1 + 1, colSpan: m.c2 - m.c1 + 1 });
    for (let r = m.r1; r <= m.r2; r++) {
      for (let c = m.c1; c <= m.c2; c++) {
        if (r === m.r1 && c === m.c1) continue;
        covered.add(`${r},${c}`);
      }
    }
  }

  const rows: React.ReactNode[] = [];
  for (let r = 0; r <= maxRow; r++) {
    const tds: React.ReactNode[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const key = `${r},${c}`;
      if (covered.has(key)) continue;
      const span = spanAt.get(key);
      const text = cellText.get(key) ?? "";
      tds.push(
        <td
          key={c}
          rowSpan={span?.rowSpan}
          colSpan={span?.colSpan}
          className="whitespace-pre-wrap border border-gray-300 px-1 py-0.5 align-top text-[10px] leading-tight text-gray-700 dark:border-gray-600 dark:text-gray-200"
        >
          {text}
        </td>
      );
    }
    rows.push(
      <tr key={r} style={{ height: rowHeightsPx[r] }}>
        {tds}
      </tr>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse" style={{ tableLayout: "fixed" }}>
        <colgroup>
          {colWidthsPx.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}
