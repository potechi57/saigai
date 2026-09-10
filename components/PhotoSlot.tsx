// 様式Ｂの<詳細スケッチ欄>・<写真張付欄>用の写真枠。1枚固定表示で、無ければ
// 「写真なし」と明示する（カルテ詳細画面の様式Ｂタブ、点検対象編集画面の両方で使う）。
//
// サイズ指定は固定px（例:`h-56`）ではなく、Tailwindのaspect-ratioユーティリティ
// （既定`aspect-video`＝16:9）にしている。固定pxだと「枠の縦横比」と「実際に
// アップロードされた写真の縦横比」がほぼ確実にズレるため、fit="contain"と
// 組み合わせても余白（レターボックス）が目立つ、あるいはfit="cover"だと大きく
// 切れる、という問題が起きていた。aspect-ratioなら枠の縦横比自体は写真によらず
// 常に一定（＝「全体の大きさを固定」）にしつつ、幅は親要素いっぱい（w-full）に
// 追従する（＝レスポンシブ）。
// 既定を16:9にしているのは、実際のExcelがA4横向きで印刷される横長の様式である
// ことに合わせるため（元は写真によく合う4:3にしていたが、様式Ｂ・様式Ｄは
// <詳細スケッチ欄>等の写真を縦に複数並べる構成のため、4:3だと様式全体が
// 縦に間延びしてA4横向きの比率から離れてしまっていた。16:9にすることで
// 各写真枠の高さを抑え、様式全体をA4横向き相当かそれ以上の横長比率に近づけている）。
// 実際にアップロードされる写真の縦横比は様々なため、これでも合わない写真では
// 依然として余白または切れが生じうる点は変わらない（トレードオフ。fit="contain"なら
// 余白、fit="cover"なら切れになる）。
export default function PhotoSlot({
  photo,
  aspectClass = "aspect-video",
  fit = "contain",
}: {
  photo?: { id: string; url: string; caption: string | null } | null;
  aspectClass?: string;
  fit?: "cover" | "contain";
}) {
  if (!photo) {
    return (
      <div
        className={`flex ${aspectClass} w-full items-center justify-center rounded border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500`}
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
        className={`${aspectClass} w-full rounded border border-gray-300 dark:border-gray-700 ${
          fit === "contain" ? "bg-gray-50 object-contain dark:bg-gray-800" : "object-cover"
        }`}
      />
    </a>
  );
}
