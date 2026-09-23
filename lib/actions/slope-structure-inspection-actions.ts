"use server";

import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import {
  parseSlopeStructureInspectionExcel,
  type SlopeStructureInspectionData,
} from "@/lib/excel/slope-structure-inspection-import";
import { logAudit } from "@/lib/audit";
import { mapWithConcurrency } from "@/lib/concurrency";
import { fetchOwnBlobBuffer } from "@/lib/blob-fetch";

// 写真アップロードの同時実行数上限（lib/concurrency.tsのコメント参照）。
const UPLOAD_CONCURRENCY = 6;

// 点検調書＞道路＞法面構造物のExcel取込（lib/actions/bridge-inspection-actions.ts
// と同じ方針: 管理番号（点検表の「箇所番号」欄）で施設台帳（FacilityListItem）の
// 法面構造物行と紐付ける）。
//
// 【再取込み時の年度別履歴保存について】gate-sign-inspection-actions.ts・
// bridge-inspection-actions.tsと同じ理由・同じ方式（schema.prismaの
// SlopeStructureInspection.previousInspectionIdコメント参照）。

function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

export type ImportSlopeStructureInspectionResult =
  | { ok: true; id: string; managementNo: string | null; matchedFacility: boolean }
  | { ok: false; error: string };

export async function importSlopeStructureInspectionExcel(
  _prevState: ImportSlopeStructureInspectionResult | null,
  formData: FormData
): Promise<ImportSlopeStructureInspectionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ファイルが選択されていません。" };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return runImportSlopeStructureInspection(buffer, file.name);
}

// 本番（Vercel）のServer Actionリクエストサイズ上限を回避するため、写真埋め込みで
// 数MB以上になりがちなファイルはブラウザから直接Vercel Blobへアップロードし、
// ここにはそのURLだけを渡す経路（lib/actions/bridge-inspection-actions.tsの
// importBridgeInspectionExcelFromBlobと同じ理由・同じ方式）。
export async function importSlopeStructureInspectionExcelFromBlob(
  blobUrl: string,
  fileName: string
): Promise<ImportSlopeStructureInspectionResult> {
  let buffer: Buffer;
  try {
    buffer = await fetchOwnBlobBuffer(blobUrl);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return runImportSlopeStructureInspection(buffer, fileName);
}

async function runImportSlopeStructureInspection(
  buffer: Buffer,
  fileName: string
): Promise<ImportSlopeStructureInspectionResult> {
  if (!hasBlobCredentials()) {
    return {
      ok: false,
      error: "Vercel Blobが未設定です。VercelダッシュボードでBlobストアを作成し、このプロジェクトに接続してください。",
    };
  }

  let data: SlopeStructureInspectionData | null;
  try {
    data = await parseSlopeStructureInspectionExcel(buffer, fileName);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Excelの解析に失敗しました（詳細: ${detail}）` };
  }
  if (!data) {
    return {
      ok: false,
      error: "「点検表」シートが見つかりませんでした。法面構造物の点検調書Excelか確認してください。",
    };
  }

  const facility = data.managementNo
    ? await prisma.facilityListItem.findUnique({ where: { managementNo: data.managementNo }, select: { id: true } })
    : null;

  const previous = data.managementNo
    ? await prisma.slopeStructureInspection.findFirst({
        where: { managementNo: data.managementNo, supersededByInspection: { is: null } },
        include: { favorite: { select: { id: true } } },
      })
    : null;

  const folder = data.managementNo ?? `unmatched-${Date.now()}`;
  async function uploadImage(image: { data: Buffer; ext: string }, sub: string): Promise<string> {
    const blob = await put(
      `slope-structure-inspections/${folder}/${sub}-${Date.now()}-${Math.random().toString(36).slice(2)}.${image.ext}`,
      image.data,
      { access: "public", contentType: `image/${image.ext}` }
    );
    return blob.url;
  }

  let photoUrls: { url: string; caption: string | null; category: string }[];
  try {
    photoUrls = await mapWithConcurrency(data.photos, UPLOAD_CONCURRENCY, async (p, i) => ({
      url: await uploadImage(p.image, `photo-${i}`),
      caption: p.caption,
      category: p.category,
    }));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `写真のアップロードに失敗しました（詳細: ${detail}）` };
  }

  const created = await prisma.slopeStructureInspection.create({
    data: {
      facilityListItemId: facility?.id ?? null,
      managementNo: data.managementNo,
      previousInspectionId: previous?.id ?? null,
      structureType: data.structureType,
      managerOrgName: data.managerOrgName,
      routeName: data.routeName,
      location: data.location,
      distanceMarkFrom: data.distanceMarkFrom,
      distanceMarkTo: data.distanceMarkTo,
      latitude: data.latitude,
      longitude: data.longitude,
      inspectionDate: data.inspectionDate,
      photoDate: data.photoDate,
      weather: data.weather,
      structureScore: data.structureScore,
      groundScore: data.groundScore,
      overallJudgment: data.overallJudgment,
      geologyDescription: data.geologyDescription,
      summaryComment: data.summaryComment,
      inspectionFindings: data.inspectionFindings,
      dailyInspectionPoints: data.dailyInspectionPoints,
      sourceFileName: fileName,
      sheets: {
        create: data.sheets.map((s, i) => ({
          sheetName: s.sheetName,
          label: s.label,
          sortOrder: i,
          grid: s.grid as object,
        })),
      },
      photos: {
        create: photoUrls.map((p, i) => ({
          url: p.url,
          caption: p.caption,
          sortOrder: i,
          category: p.category,
        })),
      },
    },
  });

  if (previous?.favorite) {
    await prisma.favorite.update({
      where: { id: previous.favorite.id },
      data: { slopeStructureInspectionId: created.id },
    });
  }

  await logAudit({
    action: "CREATE",
    entityType: "点検調書（法面構造物）",
    summary: `${data.managementNo ?? fileName}（${data.routeName ?? "路線不明"}）の法面構造物点検調書を取込${previous ? "（前回記録を引き継ぎ）" : ""}`,
    linkHref: `/inspections/slopes/${created.id}`,
  });

  revalidatePath("/inspections/slopes");
  revalidatePath("/karte");
  if (previous) revalidatePath(`/inspections/slopes/${previous.id}`);

  return { ok: true, id: created.id, managementNo: data.managementNo, matchedFacility: !!facility };
}

// 履歴チェーン全体を削除する（bridge-inspection-actions.tsのdeleteBridgeInspection
// と同じ方針）。
export async function deleteSlopeStructureInspection(id: string): Promise<void> {
  const chain: { id: string; managementNo: string | null; sourceFileName: string | null }[] = [];
  let cursor: string | null = id;
  while (cursor) {
    const record: {
      id: string;
      managementNo: string | null;
      sourceFileName: string | null;
      previousInspectionId: string | null;
    } | null = await prisma.slopeStructureInspection.findUnique({
      where: { id: cursor },
      select: { id: true, managementNo: true, sourceFileName: true, previousInspectionId: true },
    });
    if (!record) break;
    chain.push(record);
    cursor = record.previousInspectionId;
  }
  if (chain.length === 0) return;

  const photoUrls = await prisma.slopeStructureInspectionPhoto.findMany({
    where: { inspectionId: { in: chain.map((c) => c.id) } },
    select: { url: true },
  });
  await Promise.all(photoUrls.map((p) => del(p.url).catch(() => {})));

  // previousInspectionIdの一意制約があるため、新しい方（末尾）から順に削除する。
  for (const record of chain) {
    await prisma.slopeStructureInspection.delete({ where: { id: record.id } });
  }

  const latest = chain[0];
  await logAudit({
    action: "DELETE",
    entityType: "点検調書（法面構造物）",
    summary: `${latest.managementNo ?? latest.sourceFileName ?? "点検調書"}を削除（${chain.length}年度分）`,
  });
  revalidatePath("/inspections/slopes");
  revalidatePath("/karte");
}
