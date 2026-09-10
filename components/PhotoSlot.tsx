// 様式Ｂの<詳細スケッチ欄>・<写真張付欄>用の写真枠。1枚固定表示で、無ければ
// 「写真なし」と明示する（カルテ詳細画面の様式Ｂタブ、点検対象編集画面の両方で使う）。
//
// fit="cover"（既定）は指定した高さの枠いっぱいに写真を敷き詰める代わりに、
// 縦横比が枠と合わない写真の一部が切れる（<写真張付欄>のような1枚だけ大きく
// 見せたい用途向け）。
// fit="contain"は逆に、写真の一部が切れて見えなくなることを避けたい用途向け
// （<詳細スケッチ欄>の2枚等）。ただし高さを写真の縦横比に完全に合わせてしまうと
// （以前試した`h-auto`）、縦長の写真1枚で様式Ｂ全体が非常に大きくなってしまったため、
// heightClassで高さは固定したまま、object-containで余白（レターボックス）を
// 許容してトリミング無しに全体を収める方式にしている（＝写真が何枚・どんな縦横比でも
// 全体の高さは常に一定になる）。
export default function PhotoSlot({
  photo,
  heightClass,
  fit = "cover",
}: {
  photo?: { id: string; url: string; caption: string | null } | null;
  heightClass: string;
  fit?: "cover" | "contain";
}) {
  if (!photo) {
    return (
      <div
        className={`flex ${heightClass} items-center justify-center rounded border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500`}
      >
        写真なし
      </div>
    );
  }
  return (
    <a href={photo.url} target="_blank" rel="noreferrer" title={photo.caption ?? undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.caption ?? "写真"}
        className={`${heightClass} w-full rounded border border-gray-300 dark:border-gray-700 ${
          fit === "contain" ? "bg-gray-50 object-contain dark:bg-gray-800" : "object-cover"
        }`}
      />
    </a>
  );
}
