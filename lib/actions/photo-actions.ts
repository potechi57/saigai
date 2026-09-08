"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PhotoSourceForm } from "@prisma/client";

// 写真の保存先はVercel Blob。ローカルディスクへの保存はVercel本番環境（サーバーレス、
// ファイルシステムはデプロイのたびにリセットされる）では機能しないため採用していない。
//
// 認証方式は2通りある: (1) 従来の固定トークン BLOB_READ_WRITE_TOKEN、
// (2) 新しいOIDC方式（VERCEL_OIDC_TOKEN + ストアID、Vercelダッシュボードで
// Blobストアをプロジェクトに接続すると自動設定される）。
// 実際にVercel上でOIDC接続のプロジェクトを使ったところ、BLOB_READ_WRITE_TOKENは
// 設定されずVERCEL_OIDC_TOKENのみが設定される構成があることを確認したため、
// どちらかが存在すれば認証情報ありと判定する（@vercel/blob自体もこの2方式＋
// tokenオプションの3通りをサポートしている）。
function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

export type UploadPhotoResult = { ok: true } | { ok: false; error: string };

// targetId が null の場合はカルテ本体に紐づく写真として保存する
// （様式Ａの「点検地点位置図」「現況写真」に相当。点検対象を横断する全景写真等）。
export async function uploadPhoto(
  targetId: string | null,
  karteId: string,
  karteFacilityNo: string,
  _prevState: UploadPhotoResult | null,
  formData: FormData
): Promise<UploadPhotoResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "画像ファイルが選択されていません。" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "画像ファイル（jpg/png等）を選択してください。" };
  }

  // @vercel/blob は認証情報が全く無い場合、すぐには失敗せず内部のリトライ処理で
  // 1分以上待たされた末にエラーになることを実際に確認した。UXが悪いため、
  // 呼び出し前に自前でチェックして即座に分かりやすいエラーを返す。
  if (!hasBlobCredentials()) {
    return {
      ok: false,
      error:
        "Vercel Blobが未設定です。VercelダッシュボードでBlobストアを作成し、" +
        "このプロジェクトに接続してください（README参照）。",
    };
  }

  let url: string;
  try {
    const scope = targetId ?? "_karte";
    const blob = await put(`karte-photos/${karteFacilityNo}/${scope}/${Date.now()}-${file.name}`, file, {
      access: "public",
    });
    url = blob.url;
  } catch {
    return {
      ok: false,
      error: "画像のアップロードに失敗しました。Vercel Blobの設定を確認してください（README参照）。",
    };
  }

  const takenAtRaw = formData.get("takenAt");
  const takenAt = typeof takenAtRaw === "string" && takenAtRaw ? new Date(takenAtRaw) : null;
  const takenByRaw = formData.get("takenBy");
  const captionRaw = formData.get("caption");

  await prisma.photo.create({
    data: {
      karteId,
      targetId: targetId ?? undefined,
      url,
      sourceForm: PhotoSourceForm.OTHER,
      takenAt,
      takenBy: typeof takenByRaw === "string" && takenByRaw ? takenByRaw : null,
      caption: typeof captionRaw === "string" && captionRaw ? captionRaw : null,
    },
  });

  revalidatePath(`/karte/${karteFacilityNo}`);
  return { ok: true };
}
