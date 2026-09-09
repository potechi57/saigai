// 様式Ｂの<詳細スケッチ欄>・<写真張付欄>用の写真枠。1枚固定表示で、無ければ
// 「写真なし」と明示する（カルテ詳細画面の様式Ｂタブ、点検対象編集画面の両方で使う）。
export default function PhotoSlot({
  photo,
  heightClass,
}: {
  photo?: { id: string; url: string; caption: string | null } | null;
  heightClass: string;
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
        className={`${heightClass} w-full rounded border border-gray-300 object-cover dark:border-gray-700`}
      />
    </a>
  );
}
