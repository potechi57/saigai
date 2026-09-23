import { upload } from "@vercel/blob/client";

// Server Action（ひいてはVercel Functions）のリクエスト本文サイズ上限を回避する
// ための閾値（components/ExcelImportForm.tsxで確立したパターンと同じ値・同じ
// 理由）。写真が埋め込まれた点検調書Excel（橋梁・門型標識・法面構造物）は
// 数MB〜20MB超になることが多く、本番（Vercel）ではファイル本体をそのまま
// Server Actionへ渡す経路だと、Vercel Functions自体のリクエストサイズ上限
// （約4.5MB。next.config.mjsのbodySizeLimitはNext.js側の設定であり、この
// プラットフォーム側の上限には影響しない）に達して取込が完了しない場合がある
// （会話ログ「橋梁点検の調書を追加しましたが、読み込まれません」原因調査より）。
export const DIRECT_UPLOAD_THRESHOLD_BYTES = 700 * 1024; // 700KB。Next.jsの既定1MB制限より安全側に

// このサイズを超えるファイルは、ブラウザから直接Vercel Blobへアップロードしてから
// Server ActionにはそのURLだけを渡す（app/api/blob-upload/route.tsがトークン発行、
// lib/blob-fetch.tsのfetchOwnBlobBufferがサーバー側での取得を担う）。
export async function uploadFileToBlob(
  file: File,
  folderPrefix: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const blob = await upload(`${folderPrefix}/${Date.now()}-${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
    onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage) : undefined,
  });
  return blob.url;
}
