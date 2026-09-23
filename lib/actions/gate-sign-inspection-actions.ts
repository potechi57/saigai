"use server";

import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { parseGateSignInspectionExcel, type GateSignInspectionData } from "@/lib/excel/gate-sign-inspection-import";
import { logAudit } from "@/lib/audit";
import { mapWithConcurrency } from "@/lib/concurrency";
import { fetchOwnBlobBuffer } from "@/lib/blob-fetch";

// 写真アップロードの同時実行数上限（lib/concurrency.tsのコメント参照）。
const UPLOAD_CONCURRENCY = 6;

// 点検調書＞道路＞門型標識のExcel取込（会話ログ参照）。1ファイル＝1施設の
// 詳細点検報告書で、施設台帳（FacilityListItem）の道路標識行と管理番号で
// 紐付ける。管理番号はExcel内ではなくファイル名から取得する
// （lib/excel/gate-sign-inspection-import.ts参照）。
//
// 【再取込み時の年度別履歴保存について】以前は同じ管理番号の既存レコードを
// 削除してから作り直していたが、(1) お気に入り・共有済みURLが無効になる、
// (2) 前回点検の判定・写真が跡形もなく消え経年比較ができない、という2つの
// 問題があった（会話ログ「点検調書の再取込みで、IDが変わり、過去のデータが
// 消える」参照）。そこで、削除せずに新しいレコードを作り、旧レコードの
// previousInspectionIdに新レコードのidをセットして連鎖させる方式にした
// （schema.prismaのGateSignInspection.previousInspectionIdコメント参照）。
// 管理番号が取得できなかった場合（ファイル名が想定の形式でない）は
// 履歴として連鎖させる基準が無いため、毎回新規（独立した）レコードとして作成する。

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
  const buffer = Buffer.from(await file.arrayBuffer());
  return runImportGateSignInspection(buffer, file.name);
}

// 本番（Vercel）のServer Actionリクエストサイズ上限を回避するため、写真埋め込みで
// 数MB以上になりがちなファイルはブラウザから直接Vercel Blobへアップロードし、
// ここにはそのURLだけを渡す経路（lib/actions/bridge-inspection-actions.tsの
// importBridgeInspectionExcelFromBlobと同じ理由・同じ方式。会話ログ「橋梁点検の
// 調書を追加しましたが、読み込まれません」原因調査より）。
export async function importGateSignInspectionExcelFromBlob(
  blobUrl: string,
  fileName: string
): Promise<ImportGateSignInspectionResult> {
  let buffer: Buffer;
  try {
    buffer = await fetchOwnBlobBuffer(blobUrl);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return runImportGateSignInspection(buffer, fileName);
}

async function runImportGateSignInspection(buffer: Buffer, fileName: string): Promise<ImportGateSignInspectionResult> {
  if (!hasBlobCredentials()) {
    return {
      ok: false,
      error: "Vercel Blobが未設定です。VercelダッシュボードでBlobストアを作成し、このプロジェクトに接続してください。",
    };
  }

  let data: GateSignInspectionData | null;
  try {
    data = await parseGateSignInspectionExcel(buffer, fileName);
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

  // 同じ管理番号の「現在有効な最新レコード」（supersededByInspectionが無いもの）を
  // 探す。見つかっても削除はせず、新レコード作成後にpreviousInspectionIdで
  // つなぐ（上記コメント参照）。
  const previous = data.managementNo
    ? await prisma.gateSignInspection.findFirst({
        where: { managementNo: data.managementNo, supersededByInspection: { is: null } },
        include: { favorite: { select: { id: true } } },
      })
    : null;

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
    overviewPhotoUrls = await mapWithConcurrency(data.overviewPhotos, UPLOAD_CONCURRENCY, async (p, i) => ({
      url: await uploadImage(p.image, `overview-${i}`),
      caption: p.caption,
    }));
    memberPhotoUrls = await mapWithConcurrency(data.members, UPLOAD_CONCURRENCY, (m, i) =>
      m.photo ? uploadImage(m.photo, `member-${i}`) : Promise.resolve(null)
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `写真のアップロードに失敗しました（詳細: ${detail}）` };
  }

  const created = await prisma.gateSignInspection.create({
    data: {
      facilityListItemId: facility?.id ?? null,
      managementNo: data.managementNo,
      previousInspectionId: previous?.id ?? null,
      facilityName: data.facilityName,
      facilityForm: data.facilityForm,
      routeName: data.routeName,
      location: data.location,
      idNumber: data.idNumber,
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
      memberOverview: data.memberOverview,
      sourceFileName: fileName,
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

  // 旧レコードにお気に入り登録があれば、新レコードへ引き継ぐ（会話ログ
  // 「お気に入り登録が消える」問題への対応。お気に入りは「この施設を継続的に
  // 注視している」という意味合いのため、特定年度の記録ではなく常に最新の
  // レコードを指すようにする）。
  if (previous?.favorite) {
    await prisma.favorite.update({
      where: { id: previous.favorite.id },
      data: { gateSignInspectionId: created.id },
    });
  }

  await logAudit({
    action: "CREATE",
    entityType: "点検調書（門型標識）",
    summary: `${data.managementNo ?? fileName}（${data.routeName ?? "路線不明"}）の門型標識点検調書を取込${previous ? "（前回記録を引き継ぎ）" : ""}`,
    linkHref: `/inspections/gate-signs/${created.id}`,
  });

  revalidatePath("/inspections/gate-signs");
  revalidatePath("/map");
  if (previous) revalidatePath(`/inspections/gate-signs/${previous.id}`);

  return { ok: true, id: created.id, managementNo: data.managementNo, matchedFacility: !!facility };
}

// 履歴チェーン全体（previousInspectionIdを遡って辿れる全レコード）を削除する。
// 「この点検調書を削除」は施設そのものの記録を丸ごと消す操作という位置づけ
// （特定年度だけを消す機能は無い。会話ログでも年度単位の削除は要望されていない）。
export async function deleteGateSignInspection(id: string): Promise<void> {
  const chain: { id: string; managementNo: string | null; sourceFileName: string | null }[] = [];
  let cursor: string | null = id;
  while (cursor) {
    const record: { id: string; managementNo: string | null; sourceFileName: string | null; previousInspectionId: string | null } | null =
      await prisma.gateSignInspection.findUnique({
        where: { id: cursor },
        select: { id: true, managementNo: true, sourceFileName: true, previousInspectionId: true },
      });
    if (!record) break;
    chain.push(record);
    cursor = record.previousInspectionId;
  }
  if (chain.length === 0) return;

  const photoUrls = await prisma.gateSignInspectionPhoto.findMany({
    where: { inspectionId: { in: chain.map((c) => c.id) } },
    select: { url: true },
  });
  const memberPhotoUrls = await prisma.gateSignInspectionMember.findMany({
    where: { inspectionId: { in: chain.map((c) => c.id) }, photoUrl: { not: null } },
    select: { photoUrl: true },
  });
  await Promise.all([
    ...photoUrls.map((p) => del(p.url).catch(() => {})),
    ...memberPhotoUrls.map((m) => del(m.photoUrl as string).catch(() => {})),
  ]);

  // previousInspectionIdの一意制約があるため、新しい方（末尾）から順に削除する
  // （途中のレコードを先に消すと、それを参照しているレコードのFK制約に引っかかる）。
  for (const record of chain) {
    await prisma.gateSignInspection.delete({ where: { id: record.id } });
  }

  const latest = chain[0];
  await logAudit({
    action: "DELETE",
    entityType: "点検調書（門型標識）",
    summary: `${latest.managementNo ?? latest.sourceFileName ?? "点検調書"}を削除（${chain.length}年度分）`,
  });
  revalidatePath("/inspections/gate-signs");
  revalidatePath("/map");
}
