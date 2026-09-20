// Excelの様式をそのままWeb上に再現する表（門型標識・橋梁・カルテの様式Ａ・
// 様式Ｂ等）で共通して使うセル。以前は各ページ（karte/[karteNo]、
// inspections/gate-signs/[id]、inspections/bridges/[id]）にそれぞれ同じ内容の
// Th/Tdを個別に定義していたが、法面構造物の追加でさらに増える見込みだったため
// 共通化した（会話ログ「共通コンポーネント化。やり方は任せます」参照）。
export function Th({
  children,
  colSpan,
  rowSpan,
  className = "",
}: {
  children: React.ReactNode;
  colSpan?: number;
  rowSpan?: number;
  className?: string;
}) {
  return (
    <th
      colSpan={colSpan}
      rowSpan={rowSpan}
      className={`border border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-1 text-left align-middle font-medium whitespace-nowrap text-gray-600 dark:text-gray-300 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  colSpan,
  rowSpan,
  // trueならセル内で折り返す（ラベル上・値下レイアウトで長文を表示する場合。
  // 門型標識・橋梁の様式１タブ参照）。falseなら折り返さない（カルテの様式Ａ・
  // 様式Ｂのような、ラベルと値を横並びにする密な表向け。既定値）。
  // whitespace-nowrap/whitespace-pre-wrapはCSSの優先順位がクラスの並び順に
  // 依存せずTailwindの生成順で決まってしまうため、classNameでの上書きに
  // 頼らずbooleanで明示的に切り替える。
  wrap = false,
  className = "",
}: {
  children: React.ReactNode;
  colSpan?: number;
  rowSpan?: number;
  wrap?: boolean;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      rowSpan={rowSpan}
      className={`border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 ${wrap ? "align-top whitespace-pre-wrap" : "align-middle whitespace-nowrap"} ${className}`}
    >
      {children}
    </td>
  );
}
