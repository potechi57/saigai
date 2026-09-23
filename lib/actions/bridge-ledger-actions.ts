"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseBridgeLedgerExcel, type BridgeLedgerData } from "@/lib/excel/bridge-ledger-import";
import { logAudit } from "@/lib/audit";

// 橋梁台帳のExcel取込（会話ログ参照）。施設台帳（FacilityListItem）の橋梁行と
// 管理番号で紐付ける。gate-sign-inspection-actions.tsと異なり、橋梁台帳には
// 写真（Vercel Blob）が無いため、アップロード処理は不要。
//
// 再取込時は、同じ管理番号の既存レコードを削除してから作り直す（点検調書と
// 同じ「詳細記録そのものの差し替え」という考え方。BridgeLedgerSheet（汎用
// グリッドデータ）もonDelete: Cascadeでまとめて削除される）。管理番号が
// 取得できなかった場合は毎回新規作成する。

export type ImportBridgeLedgerResult =
  | { ok: true; id: string; managementNo: string | null; matchedFacility: boolean }
  | { ok: false; error: string };

export async function importBridgeLedgerExcel(
  _prevState: ImportBridgeLedgerResult | null,
  formData: FormData
): Promise<ImportBridgeLedgerResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ファイルが選択されていません。" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let data: BridgeLedgerData | null;
  try {
    data = parseBridgeLedgerExcel(buffer, file.name);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Excelの解析に失敗しました（詳細: ${detail}）` };
  }
  if (!data) {
    return {
      ok: false,
      error: "「橋梁調書」シートが見つかりませんでした。橋梁台帳Excel（橋梁調書・橋梁台帳・画像・付属図）か確認してください。",
    };
  }

  const facility = data.managementNo
    ? await prisma.facilityListItem.findUnique({ where: { managementNo: data.managementNo }, select: { id: true } })
    : null;

  if (data.managementNo) {
    const existing = await prisma.bridgeLedger.findFirst({ where: { managementNo: data.managementNo }, select: { id: true } });
    if (existing) {
      await prisma.bridgeLedger.delete({ where: { id: existing.id } });
    }
  }

  const created = await prisma.bridgeLedger.create({
    data: {
      facilityListItemId: facility?.id ?? null,
      managementNo: data.managementNo,
      managementCategory: data.managementCategory,
      bridgeNameKana: data.bridgeNameKana,
      bridgeName: data.bridgeName,
      officeName: data.officeName,
      routeName: data.routeName,
      spanCount: data.spanCount,
      constructedAt: data.constructedAt,
      location: data.location,
      bridgeType: data.bridgeType,
      bridgeLengthM: data.bridgeLengthM,
      superstructureType: data.superstructureType,
      deckMaterial: data.deckMaterial,
      substructureType: data.substructureType,
      appliedSpec: data.appliedSpec,
      latitude: data.latitude,
      longitude: data.longitude,
      widthRoadwayM: data.widthRoadwayM,
      widthSidewalkM: data.widthSidewalkM,
      widthShoulderM: data.widthShoulderM,
      widthCurbM: data.widthCurbM,
      widthOtherM: data.widthOtherM,
      widthTotalM: data.widthTotalM,
      widthRemarks: data.widthRemarks,
      areaRoadwayM2: data.areaRoadwayM2,
      areaSidewalkM2: data.areaSidewalkM2,
      areaShoulderM2: data.areaShoulderM2,
      areaCurbM2: data.areaCurbM2,
      areaOtherM2: data.areaOtherM2,
      areaTotalM2: data.areaTotalM2,
      censusNo: data.censusNo,
      seismicReinforcement: data.seismicReinforcement,
      surveyYear: data.surveyYear,
      trafficVolume: data.trafficVolume,
      largeVehicleTraffic: data.largeVehicleTraffic,
      coastDistance: data.coastDistance,
      emergencyTransportRoad: data.emergencyTransportRoad,
      priorityRoute: data.priorityRoute,
      mainGirderCount: data.mainGirderCount,
      abutmentHeightM: data.abutmentHeightM,
      pierHeightM: data.pierHeightM,
      occupyingObjectName: data.occupyingObjectName,
      denselyPopulatedArea: data.denselyPopulatedArea,
      detourRoute: data.detourRoute,
      busRoute: data.busRoute,
      overpassRailway: data.overpassRailway,
      overpassRoad: data.overpassRoad,
      overseaBridge: data.overseaBridge,
      longBridge: data.longBridge,
      saltDamageArea: data.saltDamageArea,
      upDownLine: data.upDownLine,
      bicycleRoad: data.bicycleRoad,
      footbridge: data.footbridge,
      sideRoadBridge: data.sideRoadBridge,
      weatheringSteel: data.weatheringSteel,
      underRiver: data.underRiver,
      underRoad: data.underRoad,
      bridgeManagementCategory: data.bridgeManagementCategory,
      roadCategory: data.roadCategory,
      loadRestriction: data.loadRestriction,
      underRailway: data.underRailway,
      underOther: data.underOther,
      sourceFileName: file.name,
      sheets: {
        create: data.sheets.map((s, i) => ({
          sheetName: s.sheetName,
          label: s.label,
          sortOrder: i,
          grid: s.grid,
        })),
      },
    },
  });

  await logAudit({
    action: "CREATE",
    entityType: "橋梁台帳",
    summary: `${data.managementNo ?? file.name}（${data.bridgeName ?? "橋名不明"}）の橋梁台帳を取込`,
    linkHref: `/bridge-ledgers/${created.id}`,
  });

  revalidatePath("/bridge-ledgers");
  revalidatePath("/map");

  return { ok: true, id: created.id, managementNo: data.managementNo, matchedFacility: !!facility };
}

export async function deleteBridgeLedger(id: string): Promise<void> {
  const existing = await prisma.bridgeLedger.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.bridgeLedger.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "橋梁台帳",
    summary: `${existing.managementNo ?? existing.sourceFileName ?? "橋梁台帳"}を削除`,
  });
  revalidatePath("/bridge-ledgers");
  revalidatePath("/map");
}
