import Link from "next/link";
import { notFound } from "next/navigation";
import type { PhotoSourceForm } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL, WEATHER_LABEL, RESPONSE_META, PHOTO_SOURCE_FORM_LABEL } from "@/lib/labels";
import { PhotoLightboxGroup, PhotoLightboxThumbnail, type LightboxPhoto } from "@/components/PhotoLightbox";
import PhotoUploadForm from "@/components/PhotoUploadForm";
import SheetTabs, { type SheetTab } from "@/components/SheetTabs";
import { createQuickInspectionEvent } from "@/lib/actions/karte-actions";
import { DateField, SelectField, TextAreaField } from "@/components/FormFields";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const JUDGEMENT_LABEL = Object.fromEntries(
  Object.entries(RESPONSE_META).map(([value, meta]) => [value, meta.label])
);

// タブの並び順（PC側の様式の並びに合わせる。実際に写真が無い様式のタブは出さない）。
const PHOTO_TAB_ORDER: PhotoSourceForm[] = ["FORM_A", "FORM_B", "FORM_D", "GENERAL_RECORD", "OTHER"];

type PhotoItem = { id: string; url: string; caption: string | null; takenAt: Date | null };

// 様式ごとの写真グリッド。会話ログ「最も最初にくる画像化した写真は地図になる…
// 横幅いっぱいに表示してください」より、様式A（点検地点位置図＝地図）のタブのみ、
// 先頭の1枚を通常のグリッドより大きく・トリミング無しの横幅いっぱいで表示する
// （様式Aの写真は横長の図面であることが多く、正方形トリミングでは判読しづらいため）。
function PhotoGrid({ photos, bigFirst }: { photos: PhotoItem[]; bigFirst?: boolean }) {
  const lightboxPhotos: LightboxPhoto[] = photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }));
  const first = bigFirst ? photos[0] : undefined;
  const rest = bigFirst ? photos.slice(1) : photos;

  return (
    <PhotoLightboxGroup photos={lightboxPhotos}>
      <div className="p-3">
        {first && (
          <PhotoLightboxThumbnail index={0} className="mb-2 block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={first.url}
              alt={first.caption ?? "写真"}
              className="w-full rounded border border-gray-300 object-contain dark:border-gray-700"
            />
            {first.caption && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{first.caption}</p>}
          </PhotoLightboxThumbnail>
        )}
        <div className="grid grid-cols-2 gap-2">
          {rest.map((p, i) => (
            <PhotoLightboxThumbnail key={p.id} index={first ? i + 1 : i} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? "写真"}
                className="aspect-square w-full rounded border border-gray-300 object-cover dark:border-gray-700"
              />
              {p.caption && <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{p.caption}</p>}
            </PhotoLightboxThumbnail>
          ))}
        </div>
      </div>
    </PhotoLightboxGroup>
  );
}

// カルテ1件分の写真確認・現地からの写真追加・簡易な点検記録登録をまとめた
// 現場確認用ページ（優先事項10「現場（スマホ）向け画面の本格実装」Phase 5）。
// 当初は様式上の分類をせず撮影日時順に並べるだけだったが、会話ログ
// 「様式A,B,Cのような分類は分かるようにしてくれませんか」「タブによって
// 様式を分けたほうが良いかもしれません」を受け、写真の由来様式
// （Photo.sourceForm）ごとにタブ分けする構成に変更した（既存のSheetTabs
// コンポーネント＝PC側の様式タブと同じ部品を再利用）。
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
      // 点検対象・点検記録・災害履歴のどれに紐づく写真かは区別せず、このカルテに
      // 関する写真を全部まとめて取得する（様式による分類はsourceFormで後段で
      // 行う）。撮影日時の新しい順にすることで、直近の点検記録の写真から先に
      // 確認できるようにしている（PC側の詳細画面は様式の記録としての
      // 時系列＝古い順で表示するが、現場確認では「最新の状態はどうだったか」を
      // 先に見たいことが多いため、意図的に順序を変えている）。
      photos: {
        orderBy: [{ takenAt: "desc" }, { displayOrder: "asc" }],
        select: { id: true, url: true, caption: true, takenAt: true, sourceForm: true },
      },
    },
  });
  if (!karte) notFound();

  const photosByForm = new Map<PhotoSourceForm, PhotoItem[]>();
  for (const p of karte.photos) {
    const arr = photosByForm.get(p.sourceForm) ?? [];
    arr.push(p);
    photosByForm.set(p.sourceForm, arr);
  }
  const photoTabs: SheetTab[] = PHOTO_TAB_ORDER.filter((f) => (photosByForm.get(f)?.length ?? 0) > 0).map((f) => ({
    id: f,
    label: `${PHOTO_SOURCE_FORM_LABEL[f]}（${photosByForm.get(f)!.length}）`,
    content: <PhotoGrid photos={photosByForm.get(f)!} bigFirst={f === "FORM_A"} />,
  }));

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
        <div className="overflow-hidden rounded border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
          <SheetTabs tabs={photoTabs} />
        </div>
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
