"use server";

import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { parseBridgeInspectionExcel, type BridgeInspectionData } from "@/lib/excel/bridge-inspection-import";
import { logAudit } from "@/lib/audit";
import { mapWithConcurrency } from "@/lib/concurrency";

// 写真アップロードの同時実行数上限（lib/concurrency.tsのコメント参照）。
const UPLOAD_CONCURRENCY = 6;

// 点検調書＞道路＞橋梁のExcel取込（会話ログ「過去の門型標識点検のエクセル
// ファイルを参考に橋梁の点検様式の取り込みもできるようにしてほしい」参照）。
// lib/actions/gate-sign-inspection-actions.tsと同じ方針: 管理番号（Excel内の
// 「橋梁番号」欄。門型標識と異なりファイル名からではなくExcel本体から取得
// できる）で施設台帳（FacilityListItem）の橋梁行と紐付ける。
//
// 【再取込み時の年度別履歴保存について】gate-sign-inspection-actions.tsと同じ
// 理由・同じ方式（schema.prismaのBridgeInspection.previousInspectionId、
// GateSignInspection.previousInspectionIdコメント参照）。削除せず新しい
// レコードを作り、previousInspectionIdで連鎖させる。

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

  // 同じ管理番号の「現在有効な最新レコード」を探す。見つかっても削除はせず、
  // 新レコード作成後にpreviousInspectionIdでつなぐ（上記コメント参照）。
  const previous = data.managementNo
    ? await prisma.bridgeInspection.findFirst({
        where: { managementNo: data.managementNo, supersededByInspection: { is: null } },
        include: { favorite: { select: { id: true } } },
      })
    : null;

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
    photoUrls = await mapWithConcurrency(data.photos, UPLOAD_CONCURRENCY, async (p, i) => ({
      url: await uploadImage(p.image, `photo-${i}`),
      caption: p.caption,
    }));
    memberPhotoUrls = await mapWithConcurrency(data.members, UPLOAD_CONCURRENCY, (m, i) =>
      m.photo ? uploadImage(m.photo, `member-${i}`) : Promise.resolve(null)
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `写真のアップロードに失敗しました（詳細: ${detail}）` };
  }

  const created = await prisma.bridgeInspection.create({
    data: {
      facilityListItemId: facility?.id ?? null,
      managementNo: data.managementNo,
      previousInspectionId: previous?.id ?? null,
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
      managerOrgName: data.managerOrgName,
      underRoadCondition: data.underRoadCondition,
      hasAlternateRoute: data.hasAlternateRoute,
      roadCategory: data.roadCategory,
      emergencyTransportRoad: data.emergencyTransportRoad,
      occupyingObjects: data.occupyingObjects,
      installedYear: data.installedYear,
      bridgeLengthM: data.bridgeLengthM,
      roadWidthM: data.roadWidthM,
      structureType: data.structureType,
      memberOverview: data.memberOverview,
      spanDiagnoses: data.spanDiagnoses,
      sourceFileName: file.name,
      photos: {
        create: photoUrls.map((p, i) => ({
          url: p.url,
          caption: p.caption,
          sortOrder: i,
          category: data.photos[i].category,
          memberName: data.photos[i].memberName,
          damageType: data.photos[i].damageType,
          judgment: data.photos[i].judgment,
          spanRef: data.photos[i].spanRef,
        })),
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

  // 旧レコードにお気に入り登録があれば、新レコードへ引き継ぐ
  // （gate-sign-inspection-actions.tsと同じ理由）。
  if (previous?.favorite) {
    await prisma.favorite.update({
      where: { id: previous.favorite.id },
      data: { bridgeInspectionId: created.id },
    });
  }

  await logAudit({
    action: "CREATE",
    entityType: "点検調書（橋梁）",
    summary: `${data.bridgeName ?? data.managementNo ?? file.name}（${data.routeName ?? "路線不明"}）の橋梁定期点検調書を取込${previous ? "（前回記録を引き継ぎ）" : ""}`,
    linkHref: `/inspections/bridges/${created.id}`,
  });

  revalidatePath("/inspections/bridges");
  revalidatePath("/karte");
  if (previous) revalidatePath(`/inspections/bridges/${previous.id}`);

  return { ok: true, id: created.id, managementNo: data.managementNo, matchedFacility: !!facility };
}

// 履歴チェーン全体を削除する（gate-sign-inspection-actions.tsの
// deleteGateSignInspectionと同じ方針。「この点検調書を削除」は施設そのものの
// 記録を丸ごと消す操作という位置づけ）。
export async function deleteBridgeInspection(id: string): Promise<void> {
  const chain: { id: string; bridgeName: string | null; managementNo: string | null; sourceFileName: string | null }[] = [];
  let cursor: string | null = id;
  while (cursor) {
    const record: {
      id: string;
      bridgeName: string | null;
      managementNo: string | null;
      sourceFileName: string | null;
      previousInspectionId: string | null;
    } | null = await prisma.bridgeInspection.findUnique({
      where: { id: cursor },
      select: { id: true, bridgeName: true, managementNo: true, sourceFileName: true, previousInspectionId: true },
    });
    if (!record) break;
    chain.push(record);
    cursor = record.previousInspectionId;
  }
  if (chain.length === 0) return;

  const photoUrls = await prisma.bridgeInspectionPhoto.findMany({
    where: { inspectionId: { in: chain.map((c) => c.id) } },
    select: { url: true },
  });
  const memberPhotoUrls = await prisma.bridgeInspectionMember.findMany({
    where: { inspectionId: { in: chain.map((c) => c.id) }, photoUrl: { not: null } },
    select: { photoUrl: true },
  });
  await Promise.all([
    ...photoUrls.map((p) => del(p.url).catch(() => {})),
    ...memberPhotoUrls.map((m) => del(m.photoUrl as string).catch(() => {})),
  ]);

  // previousInspectionIdの一意制約があるため、新しい方（末尾）から順に削除する。
  for (const record of chain) {
    await prisma.bridgeInspection.delete({ where: { id: record.id } });
  }

  const latest = chain[0];
  await logAudit({
    action: "DELETE",
    entityType: "点検調書（橋梁）",
    summary: `${latest.bridgeName ?? latest.managementNo ?? latest.sourceFileName ?? "点検調書"}を削除（${chain.length}年度分）`,
  });
  revalidatePath("/inspections/bridges");
  revalidatePath("/karte");
}
