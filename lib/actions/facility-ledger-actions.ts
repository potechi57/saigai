"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { FacilityLedgerDocClass } from "@prisma/client";

// トンネル台帳等、Excelのような構造化データが無くスキャン画像でしか残っていない
// 台帳を、「画像1枚＋最低限の基本情報」という単純な形で登録するためのServer Action群。
// カルテ（道路防災カルテ）のExcel取込とは完全に独立した、別の仕組みにしている
// （詳細はprisma/schema.prismaのFacilityLedgerコメント参照）。
//
// 【必須項目は画像のみ】種別（分野・施設名称）・台帳名・路線名・所在地・緯度経度は
// 全て任意にしている（会話ログ「全てを入れなくてもよいように」参照）。台帳名が
// 未入力の場合は、種別（分野・施設名称）から自動生成し、それも無ければ
// 「台帳（画像）」という最低限のプレースホルダにする。

function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

export type CreateFacilityLedgerResult = { ok: true } | { ok: false; error: string };

export async function createFacilityLedger(
  _prevState: CreateFacilityLedgerResult | null,
  formData: FormData
): Promise<CreateFacilityLedgerResult> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "台帳の画像ファイルを選択してください。" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "画像ファイル（jpg/png等）を選択してください。" };
  }

  if (!hasBlobCredentials()) {
    return {
      ok: false,
      error: "Vercel Blobが未設定です。VercelダッシュボードでBlobストアを作成し、このプロジェクトに接続してください。",
    };
  }

  const docClassRaw = formData.get("docClass");
  const docClass =
    typeof docClassRaw === "string" && docClassRaw in FacilityLedgerDocClass
      ? (docClassRaw as FacilityLedgerDocClass)
      : FacilityLedgerDocClass.FACILITY;

  const facilityType = str(formData, "facilityType");
  const facilitySubType = str(formData, "facilitySubType");
  const routeName = str(formData, "routeName");
  const location = str(formData, "location");
  const note = str(formData, "note");
  const latitude = num(formData, "latitude");
  const longitude = num(formData, "longitude");

  // 台帳名が未入力の場合、種別（分野・施設名称）から自動生成する
  // （例:「道路 トンネル」）。種別も無ければ最低限のプレースホルダにする。
  const name = str(formData, "name") ?? ([facilityType, facilitySubType].filter(Boolean).join(" ") || "台帳（画像）");

  let imageUrl: string;
  try {
    const blob = await put(`facility-ledgers/${docClass}-${Date.now()}-${file.name}`, file, { access: "public" });
    imageUrl = blob.url;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `画像のアップロードに失敗しました（詳細: ${detail}）` };
  }

  await prisma.facilityLedger.create({
    data: { docClass, facilityType, facilitySubType, name, routeName, location, latitude, longitude, imageUrl, note },
  });

  revalidatePath("/ledgers");
  revalidatePath("/karte");
  redirect("/ledgers");
}

export async function deleteFacilityLedger(id: string): Promise<void> {
  const ledger = await prisma.facilityLedger.delete({ where: { id } });
  // Blob削除はベストエフォート（カルテ削除時と同じ方針。lib/actions/karte-actions.ts参照）。
  await del(ledger.imageUrl).catch(() => {});
  revalidatePath("/ledgers");
  revalidatePath("/karte");
}

// ── FormDataから安全に値を取り出す小さなヘルパー（lib/actions/karte-actions.tsと同じ方針） ──

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
