// 様式Ｂの<詳細スケッチ欄>・<写真張付欄>用の写真枠。1枚固定表示で、無ければ
// 「写真なし」と明示する（カルテ詳細画面の様式Ｂタブ、点検対象編集画面の両方で使う）。
//
// fit="cover"（既定）は指定した高さの枠いっぱいに写真を敷き詰める代わりに、
// 縦横比が枠と合わない写真の一部が切れる（<写真張付欄>のような1枚だけ大きく
// 見せたい用途向け）。
// fit="natural"は逆に、切れて見えなくなる部分が出ないことを優先し、幅に合わせた
// 自然な高さでトリミング無しに全体を表示する（<詳細スケッチ欄>のように、2枚とも
// 全体をきちんと見たい用途向け。写真ごとに実際の高さは変わる＝自動調整される）。
export default function PhotoSlot({
  photo,
  heightClass,
  fit = "cover",
}: {
  photo?: { id: string; url: string; caption: string | null } | null;
  heightClass: string;
  fit?: "cover" | "natural";
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
  if (fit === "natural") {
    return (
      <a href={photo.url} target="_blank" rel="noreferrer" title={photo.caption ?? undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption ?? "写真"}
          className="h-auto w-full rounded border border-gray-300 dark:border-gray-700"
        />
      </a>
    );
  }
  return (
    <a href={photo.url} target="_blank" rel="noreferrer" title={photo.caption ?? undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.caption ?? "写真"}
        className={`${heightClass} w-full rounded border border-gray-300 object-cover dark:border-gray-700`}
      />
    </a>
  );
}
