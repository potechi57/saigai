import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL, WEATHER_LABEL, RESPONSE_META } from "@/lib/labels";
import { PhotoLightboxGroup, PhotoLightboxThumbnail } from "@/components/PhotoLightbox";
import PhotoUploadForm from "@/components/PhotoUploadForm";
import { createQuickInspectionEvent } from "@/lib/actions/karte-actions";
import { DateField, SelectField, TextAreaField } from "@/components/FormFields";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const JUDGEMENT_LABEL = Object.fromEntries(
  Object.entries(RESPONSE_META).map(([value, meta]) => [value, meta.label])
);

// カルテ1件分の写真確認・現地からの写真追加・簡易な点検記録登録をまとめた
// 現場確認用ページ（優先事項10「現場（スマホ）向け画面の本格実装」Phase 5）。
// PC側の詳細画面（/karte/[karteNo]）は様式Ａ〜Ｄの見た目を忠実に再現しているが、
// ここでは様式上の分類（様式Ａ/Ｂ/Ｄ・点検対象・点検回等）はせず、そのカルテに
// 紐づく写真を撮影日時順に並べるだけにしている（現場でさっと確認できればよいため）。
export default async function MobilePhotoPage({
  params,
}: {
  params: Promise<{ facilityNo: string }>;
}) {
  const { facilityNo } = await params;
  const karte = await prisma.karte.findUnique({
    where: { facilityNo },
    select: {
      id: true,
      facilityNo: true,
      karteType: true,
      routeName: true,
      locationDistrict: true,
      locationTown: true,
      // 様式Ａ〜Ｄ・点検対象・点検記録・災害履歴のどれに紐づく写真かは区別せず、
      // このカルテに関する写真を全部まとめて見せる（現場でさっと確認できれば
      // よく、様式上の分類は不要なため）。撮影日時の新しい順にすることで、
      // 直近の点検記録の写真から先に確認できるようにしている（PC側の詳細画面は
      // 様式の記録としての時系列＝古い順で表示するが、現場確認では「最新の状態は
      // どうだったか」を先に見たいことが多いため、意図的に順序を変えている）。
      photos: {
        orderBy: [{ takenAt: "desc" }, { displayOrder: "asc" }],
        select: { id: true, url: true, caption: true, takenAt: true },
      },
    },
  });
  if (!karte) notFound();

  const quickEventAction = createQuickInspectionEvent.bind(null, karte.id, karte.facilityNo);
  // 現場での入力を1タップでも減らすため、点検日は当日をあらかじめ入れておく
  // （ローカルタイムゾーンで today、input[type=date]が要求する YYYY-MM-DD 形式）。
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Link href="/m" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 検索に戻る
      </Link>
      <div>
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">{karte.facilityNo}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {KARTE_TYPE_LABEL[karte.karteType] ?? karte.karteType} ・ {karte.routeName}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {[karte.locationDistrict, karte.locationTown].filter(Boolean).join(" ")}
        </p>
      </div>

      {karte.photos.length === 0 ? (
        <p className="rounded border border-gray-300 bg-white p-6 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
          写真が登録されていません。
        </p>
      ) : (
        <PhotoLightboxGroup photos={karte.photos}>
          <div className="grid grid-cols-2 gap-2">
            {karte.photos.map((p, i) => (
              <PhotoLightboxThumbnail key={p.id} index={i} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption ?? "写真"}
                  className="aspect-square w-full rounded border border-gray-300 object-cover dark:border-gray-700"
                />
                {p.caption && (
                  <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{p.caption}</p>
                )}
              </PhotoLightboxThumbnail>
            ))}
          </div>
        </PhotoLightboxGroup>
      )}

      <section className="rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">現地で写真を追加</h2>
        {/* capture: スマホでファイル選択時にカメラを直接起動する（現場での撮影用） */}
        <PhotoUploadForm karteId={karte.id} capture compact />
      </section>

      <section className="rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">点検結果を記録</h2>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          点検対象ごとの詳細な記録（前回との差異・被災履歴等）はPC版からご登録ください。ここでは簡易的な記録のみ行えます。
        </p>
        <form action={quickEventAction} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <DateField name="inspectionDate" label="点検日" defaultValue={todayStr} required />
            <SelectField name="weather" label="天候" options={WEATHER_LABEL} />
          </div>
          <SelectField name="specialistJudgement" label="判定区分" options={JUDGEMENT_LABEL} />
          <TextAreaField name="specialTopics" label="特記事項・コメント" />
          <SubmitButton
            pendingLabel="登録中..."
            className="w-full justify-center rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            登録する
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
