import { isOwnBlobUrl } from "@/lib/blob-url";

// クライアントから直接Vercel Blobへアップロードされたファイルを、サーバー側で
// 取得するための共通処理（lib/actions/import-actions.tsのloadWorkbookFromBlobと
// 同じ理由・同じSSRF対策。点検調書3種（橋梁・門型標識・法面構造物）のExcel取込
// （lib/actions/bridge-inspection-actions.ts等）は、ワークブックの復号（パスワード
// 解除）が不要なためBufferだけを返す簡易版として、ここに共通化する）。
export async function fetchOwnBlobBuffer(blobUrl: string): Promise<Buffer> {
  if (!isOwnBlobUrl(blobUrl)) {
    throw new Error("不正なファイルURLです。");
  }
  const res = await fetch(blobUrl);
  if (!res.ok) {
    throw new Error("アップロード済みファイルの取得に失敗しました。もう一度お試しください。");
  }
  return Buffer.from(await res.arrayBuffer());
}
