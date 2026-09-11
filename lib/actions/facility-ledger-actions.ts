"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { FacilityLedgerCategory } from "@prisma/client";

// トンネル台帳等、Excelのような構造化データが無くスキャン画像でしか残っていない
// 台帳を、「画像1枚＋最低限の基本情報」という単純な形で登録するためのServer Action群。
// カルテ（道路防災カルテ）のExcel取込とは完全に独立した、別の仕組みにしている
// （詳細はprisma/schema.prismaのFacilityLedgerコメント参照）。

function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

export type CreateFacilityLedgerResult = { ok: true } | { ok: false; error: string };

export async function createFacilityLedger(
  _prevState: CreateFacilityLedgerResult | null,
  formData: FormData
): Promise<CreateFacilityLedgerResult> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "台帳名を入力してください。" };
  }

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

  const categoryRaw = formData.get("category");
  const category =
    typeof categoryRaw === "string" && categoryRaw in FacilityLedgerCategory
      ? (categoryRaw as FacilityLedgerCategory)
      : FacilityLedgerCategory.TUNNEL;

  const routeName = str(formData, "routeName");
  const location = str(formData, "location");
  const note = str(formData, "note");
  const latitude = num(formData, "latitude");
  const longitude = num(formData, "longitude");

  let imageUrl: string;
  try {
    const blob = await put(`facility-ledgers/${category}-${Date.now()}-${file.name}`, file, { access: "public" });
    imageUrl = blob.url;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `画像のアップロードに失敗しました（詳細: ${detail}）` };
  }

  await prisma.facilityLedger.create({
    data: { category, name: name.trim(), routeName, location, latitude, longitude, imageUrl, note },
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
