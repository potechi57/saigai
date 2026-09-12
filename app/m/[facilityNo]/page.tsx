import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL } from "@/lib/labels";
import { PhotoLightboxGroup, PhotoLightboxThumbnail } from "@/components/PhotoLightbox";

export const dynamic = "force-dynamic";

// カルテ1件分の写真だけを、シンプルな一覧（グリッド）で見せる現場確認用ページ。
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
      facilityNo: true,
      karteType: true,
      routeName: true,
      locationDistrict: true,
      locationTown: true,
      photos: {
        orderBy: [{ takenAt: "asc" }, { displayOrder: "asc" }],
        select: { id: true, url: true, caption: true, takenAt: true },
      },
    },
  });
  if (!karte) notFound();

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
    </div>
  );
}
