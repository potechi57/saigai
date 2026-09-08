import { NextResponse } from "next/server";

// 一時的な診断用エンドポイント。Vercel BlobのOIDC接続まわりで、実際に本番環境で
// どの環境変数が来ているかを確認するために追加した（値は返さず有無のみ）。
// 問題解決後は削除する。
export async function GET() {
  const keys = [
    "BLOB_READ_WRITE_TOKEN",
    "VERCEL_OIDC_TOKEN",
    "BLOB_STORE_ID",
    "STORE_ID",
    "VERCEL_ENV",
    "VERCEL",
  ];
  const presence: Record<string, boolean> = {};
  for (const k of keys) {
    presence[k] = Boolean(process.env[k]);
  }
  // ブロブ関連・ストア関連の環境変数名を網羅的に拾う（値は伏せてキー名だけ返す）
  const blobRelatedKeys = Object.keys(process.env).filter((k) => /BLOB|STORE|OIDC/i.test(k));

  return NextResponse.json({ presence, blobRelatedKeys });
}
