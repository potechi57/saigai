"use server";

import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { parseGateSignInspectionExcel, type GateSignInspectionData } from "@/lib/excel/gate-sign-inspection-import";
import { logAudit } from "@/lib/audit";

// 点検調書＞道路＞門型標識のExcel取込（会話ログ参照）。1ファイル＝1施設の
// 詳細点検報告書で、施設台帳（FacilityListItem）の道路標識行と管理番号で
// 紐付ける。管理番号はExcel内ではなくファイル名から取得する
// （lib/excel/gate-sign-inspection-import.ts参照）。
//
// 再取込時は、同じ管理番号の既存レコードを削除してから作り直す（施設一覧
// Excelのような「直近点検の上書き」ではなく、詳細点検報告書そのものの
// 差し替えという性質のため。部材レコード・写真も含めて丸ごと作り直すのが
// 一番単純で分かりやすい）。管理番号が取得できなかった場合（ファイル名が
// 想定の形式でない）は毎回新規作成する（重複排除の判断基準が無いため）。

function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

export type ImportGateSignInspectionResult =
  | { ok: true; id: string; managementNo: string | null; matchedFacility: boolean }
  | { ok: false; error: string };

export async function importGateSignInspectionExcel(
  _prevState: ImportGateSignInspectionResult | null,
  formData: FormData
): Promise<ImportGateSignInspectionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ファイルが選択されていません。" };
  }
  if (!hasBlobCredentials()) {
    return {
      ok: false,
      error: "Vercel Blobが未設定です。VercelダッシュボードでBlobストアを作成し、このプロジェクトに接続してください。",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let data: GateSignInspectionData | null;
  try {
    data = await parseGateSignInspectionExcel(buffer, file.name);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Excelの解析に失敗しました（詳細: ${detail}）` };
  }
  if (!data) {
    return {
      ok: false,
      error:
        "「様式（その１）」シートが見つかりませんでした。門型標識の点検調書Excel（別紙２　様式１様式２）か確認してください。",
    };
  }

  const facility = data.managementNo
    ? await prisma.facilityListItem.findUnique({ where: { managementNo: data.managementNo }, select: { id: true } })
    : null;

  // 同じ管理番号の既存レコードがあれば、写真（Blob）ごと削除してから作り直す
  // （上記コメント参照）。
  if (data.managementNo) {
    const existing = await prisma.gateSignInspection.findFirst({
      where: { managementNo: data.managementNo },
      include: { members: { select: { photoUrl: true } }, overviewPhotos: { select: { url: true } } },
    });
    if (existing) {
      await Promise.all([
        ...existing.members.filter((m) => m.photoUrl).map((m) => del(m.photoUrl as string).catch(() => {})),
        ...existing.overviewPhotos.map((p) => del(p.url).catch(() => {})),
      ]);
      await prisma.gateSignInspection.delete({ where: { id: existing.id } });
    }
  }

  const folder = data.managementNo ?? `unmatched-${Date.now()}`;
  async function uploadImage(image: { data: Buffer; ext: string }, sub: string): Promise<string> {
    const blob = await put(`gate-sign-inspections/${folder}/${sub}-${Date.now()}-${Math.random().toString(36).slice(2)}.${image.ext}`, image.data, {
      access: "public",
      contentType: `image/${image.ext}`,
    });
    return blob.url;
  }

  let overviewPhotoUrls: { url: string; caption: string | null }[];
  let memberPhotoUrls: (string | null)[];
  try {
    overviewPhotoUrls = await Promise.all(
      data.overviewPhotos.map(async (p, i) => ({ url: await uploadImage(p.image, `overview-${i}`), caption: p.caption }))
    );
    memberPhotoUrls = await Promise.all(
      data.members.map((m, i) => (m.photo ? uploadImage(m.photo, `member-${i}`) : Promise.resolve(null)))
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `写真のアップロードに失敗しました（詳細: ${detail}）` };
  }

  const created = await prisma.gateSignInspection.create({
    data: {
      facilityListItemId: facility?.id ?? null,
      managementNo: data.managementNo,
      facilityName: data.facilityName,
      facilityForm: data.facilityForm,
      routeName: data.routeName,
      location: data.location,
      latitude: data.latitude,
      longitude: data.longitude,
      inspectionDate: data.inspectionDate,
      inspectorCompany: data.inspectorCompany,
      inspectorName: data.inspectorName,
      managerOrgName: data.managerOrgName,
      hasAlternateRoute: data.hasAlternateRoute,
      emergencyTransportRoad: data.emergencyTransportRoad,
      roadCategory: data.roadCategory,
      occupyingObjects: data.occupyingObjects,
      installedYear: data.installedYear,
      installedMonth: data.installedMonth,
      roadWidthM: data.roadWidthM,
      structureType: data.structureType,
      overallJudgment: data.overallJudgment,
      overallFindings: data.overallFindings,
      sourceFileName: file.name,
      overviewPhotos: {
        create: overviewPhotoUrls.map((p, i) => ({ url: p.url, caption: p.caption, sortOrder: i })),
      },
      members: {
        create: data.members.map((m, i) => ({
          pageNo: m.pageNo,
          photoNo: m.photoNo,
          memberName: m.memberName,
          memberDetail: m.memberDetail,
          damageType: m.damageType,
          judgment: m.judgment,
          postActionJudgment: m.postActionJudgment,
          postActionContent: m.postActionContent,
          findings: m.findings,
          remarks: m.remarks,
          photoUrl: memberPhotoUrls[i],
          sortOrder: i,
        })),
      },
    },
  });

  await logAudit({
    action: "CREATE",
    entityType: "点検調書（門型標識）",
    summary: `${data.managementNo ?? file.name}（${data.routeName ?? "路線不明"}）の門型標識点検調書を取込`,
    linkHref: `/inspections/gate-signs/${created.id}`,
  });

  revalidatePath("/inspections/gate-signs");
  revalidatePath("/karte");

  return { ok: true, id: created.id, managementNo: data.managementNo, matchedFacility: !!facility };
}

export async function deleteGateSignInspection(id: string): Promise<void> {
  const existing = await prisma.gateSignInspection.findUnique({
    where: { id },
    include: { members: { select: { photoUrl: true } }, overviewPhotos: { select: { url: true } } },
  });
  if (!existing) return;
  await Promise.all([
    ...existing.members.filter((m) => m.photoUrl).map((m) => del(m.photoUrl as string).catch(() => {})),
    ...existing.overviewPhotos.map((p) => del(p.url).catch(() => {})),
  ]);
  await prisma.gateSignInspection.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "点検調書（門型標識）",
    summary: `${existing.managementNo ?? existing.sourceFileName ?? "点検調書"}を削除`,
  });
  revalidatePath("/inspections/gate-signs");
  revalidatePath("/karte");
}
