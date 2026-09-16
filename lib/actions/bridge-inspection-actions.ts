"use server";

import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { parseBridgeInspectionExcel, type BridgeInspectionData } from "@/lib/excel/bridge-inspection-import";
import { logAudit } from "@/lib/audit";

// 点検調書＞道路＞橋梁のExcel取込（会話ログ「過去の門型標識点検のエクセル
// ファイルを参考に橋梁の点検様式の取り込みもできるようにしてほしい」参照）。
// lib/actions/gate-sign-inspection-actions.tsと同じ方針: 管理番号（Excel内の
// 「橋梁番号」欄。門型標識と異なりファイル名からではなくExcel本体から取得
// できる）で施設台帳（FacilityListItem）の橋梁行と紐付け、再取込時は同じ
// 管理番号の既存レコードを写真ごと削除してから作り直す。

function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

export type ImportBridgeInspectionResult =
  | { ok: true; id: string; managementNo: string | null; matchedFacility: boolean }
  | { ok: false; error: string };

export async function importBridgeInspectionExcel(
  _prevState: ImportBridgeInspectionResult | null,
  formData: FormData
): Promise<ImportBridgeInspectionResult> {
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
  let data: BridgeInspectionData | null;
  try {
    data = await parseBridgeInspectionExcel(buffer, file.name);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Excelの解析に失敗しました（詳細: ${detail}）` };
  }
  if (!data) {
    return {
      ok: false,
      error:
        "「道路橋様式1」「定期点検調書（その1）」シートが見つかりませんでした。橋梁の定期点検調書Excel（別紙２　様式１様式２）か確認してください。",
    };
  }

  const facility = data.managementNo
    ? await prisma.facilityListItem.findUnique({ where: { managementNo: data.managementNo }, select: { id: true } })
    : null;

  // 同じ管理番号の既存レコードがあれば、写真（Blob）ごと削除してから作り直す
  // （gate-sign-inspection-actions.tsと同じ方針。詳細点検報告書そのものの
  // 差し替えという性質のため）。
  if (data.managementNo) {
    const existing = await prisma.bridgeInspection.findFirst({
      where: { managementNo: data.managementNo },
      include: { members: { select: { photoUrl: true } }, photos: { select: { url: true } } },
    });
    if (existing) {
      await Promise.all([
        ...existing.members.filter((m) => m.photoUrl).map((m) => del(m.photoUrl as string).catch(() => {})),
        ...existing.photos.map((p) => del(p.url).catch(() => {})),
      ]);
      await prisma.bridgeInspection.delete({ where: { id: existing.id } });
    }
  }

  const folder = data.managementNo ?? `unmatched-${Date.now()}`;
  async function uploadImage(image: { data: Buffer; ext: string }, sub: string): Promise<string> {
    const blob = await put(
      `bridge-inspections/${folder}/${sub}-${Date.now()}-${Math.random().toString(36).slice(2)}.${image.ext}`,
      image.data,
      { access: "public", contentType: `image/${image.ext}` }
    );
    return blob.url;
  }

  let photoUrls: { url: string; caption: string | null }[];
  let memberPhotoUrls: (string | null)[];
  try {
    photoUrls = await Promise.all(
      data.photos.map(async (p, i) => ({ url: await uploadImage(p.image, `photo-${i}`), caption: p.caption }))
    );
    memberPhotoUrls = await Promise.all(
      data.members.map((m, i) => (m.photo ? uploadImage(m.photo, `member-${i}`) : Promise.resolve(null)))
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `写真のアップロードに失敗しました（詳細: ${detail}）` };
  }

  const created = await prisma.bridgeInspection.create({
    data: {
      facilityListItemId: facility?.id ?? null,
      managementNo: data.managementNo,
      bridgeName: data.bridgeName,
      bridgeNameKana: data.bridgeNameKana,
      routeName: data.routeName,
      location: data.location,
      officeName: data.officeName,
      spanCount: data.spanCount,
      latitude: data.latitude,
      longitude: data.longitude,
      inspectionDate: data.inspectionDate,
      inspectorCompany: data.inspectorCompany,
      responsiblePerson: data.responsiblePerson,
      overallJudgment: data.overallJudgment,
      overallFindings: data.overallFindings,
      sourceFileName: file.name,
      photos: {
        create: photoUrls.map((p, i) => ({ url: p.url, caption: p.caption, sortOrder: i })),
      },
      members: {
        create: data.members.map((m, i) => ({
          spanNo: m.spanNo,
          pageNo: m.pageNo,
          photoNo: m.photoNo,
          memberName: m.memberName,
          memberDetail: m.memberDetail,
          damageType: m.damageType,
          findings: m.findings,
          photoUrl: memberPhotoUrls[i],
          sortOrder: i,
        })),
      },
    },
  });

  await logAudit({
    action: "CREATE",
    entityType: "点検調書（橋梁）",
    summary: `${data.bridgeName ?? data.managementNo ?? file.name}（${data.routeName ?? "路線不明"}）の橋梁定期点検調書を取込`,
    linkHref: `/inspections/bridges/${created.id}`,
  });

  revalidatePath("/inspections/bridges");
  revalidatePath("/karte");

  return { ok: true, id: created.id, managementNo: data.managementNo, matchedFacility: !!facility };
}

export async function deleteBridgeInspection(id: string): Promise<void> {
  const existing = await prisma.bridgeInspection.findUnique({
    where: { id },
    include: { members: { select: { photoUrl: true } }, photos: { select: { url: true } } },
  });
  if (!existing) return;
  await Promise.all([
    ...existing.members.filter((m) => m.photoUrl).map((m) => del(m.photoUrl as string).catch(() => {})),
    ...existing.photos.map((p) => del(p.url).catch(() => {})),
  ]);
  await prisma.bridgeInspection.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "点検調書（橋梁）",
    summary: `${existing.bridgeName ?? existing.managementNo ?? existing.sourceFileName ?? "点検調書"}を削除`,
  });
  revalidatePath("/inspections/bridges");
  revalidatePath("/karte");
}
