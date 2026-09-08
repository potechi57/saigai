import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateKarte } from "@/lib/actions/karte-actions";
import KarteForm, { type KarteFormValues } from "@/components/KarteForm";
import PhotoUploadForm from "@/components/PhotoUploadForm";

export const dynamic = "force-dynamic";

function toDateInputValue(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

// カルテ編集画面（指示書12章）。
export default async function EditKartePage({ params }: { params: Promise<{ karteNo: string }> }) {
  const { karteNo } = await params;
  const karte = await prisma.karte.findUnique({
    where: { facilityNo: karteNo },
    include: {
      rockfallDetail: true,
      // カルテ本体に紐づく写真（点検対象にもイベントにも紐付かないもの）＝
      // 様式Ａの「点検地点位置図」「現況写真」に相当
      photos: {
        where: { targetId: null, eventId: null, disasterEventId: null },
        orderBy: { takenAt: "asc" },
      },
    },
  });

  if (!karte) notFound();

  const initial: KarteFormValues = {
    facilityNo: karte.facilityNo,
    karteType: karte.karteType,
    routeName: karte.routeName,
    routeNo: karte.routeNo,
    manageOrgName: karte.manageOrgName,
    manageOrgCode: karte.manageOrgCode,
    distanceMarkerFromKm: karte.distanceMarkerFromKm?.toString() ?? null,
    distanceMarkerToKm: karte.distanceMarkerToKm?.toString() ?? null,
    sideOfRoad: karte.sideOfRoad,
    extensionLengthM: karte.extensionLengthM?.toString() ?? null,
    projectCategory: karte.projectCategory,
    roadType: karte.roadType,
    roadStatus: karte.roadStatus,
    locationDistrict: karte.locationDistrict,
    locationTown: karte.locationTown,
    landmark: karte.landmark,
    latitude: karte.latitude?.toString() ?? null,
    longitude: karte.longitude?.toString() ?? null,
    geodeticSystem: karte.geodeticSystem,
    responseCategory: karte.responseCategory,
    responseEvaluatedAt: toDateInputValue(karte.responseEvaluatedAt),
    keyDeformationSummary: karte.keyDeformationSummary,
    inspectionContentSummary: karte.inspectionContentSummary,
    specialistComment: karte.specialistComment,
    mainFormRockfall: karte.rockfallDetail?.mainFormRockfall ?? false,
    mainFormCollapse: karte.rockfallDetail?.mainFormCollapse ?? false,
  };

  const action = updateKarte.bind(null, karte.id);

  return (
    <div className="space-y-4">
      <Link href={`/karte/${karte.facilityNo}`} className="text-sm text-blue-600 hover:underline">
        ← カルテ詳細に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800">カルテ編集: {karte.routeName}</h1>

      <section className="rounded border border-gray-300 bg-white p-4">
        <h2 className="mb-1 font-semibold text-gray-700">点検地点位置図・現況写真</h2>
        <p className="mb-3 text-xs text-gray-400">
          様式Ａの「点検地点位置図」「現況写真」に相当。特定の点検対象に限らない、カルテ全体の写真です
          （個別の点検対象の写真は、カルテ詳細画面の各点検対象欄から追加してください）。
        </p>
        {karte.photos.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {karte.photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.caption ?? undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption ?? "点検地点位置図・現況写真"}
                  className="h-24 w-24 rounded border border-gray-200 object-cover"
                />
              </a>
            ))}
          </div>
        )}
        <PhotoUploadForm karteId={karte.id} karteFacilityNo={karte.facilityNo} />
      </section>

      <KarteForm action={action} initial={initial} submitLabel="保存する" />
    </div>
  );
}
