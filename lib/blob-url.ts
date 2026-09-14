// Vercel Blobの実URLかどうかを検証する。
//
// 【背景・セキュリティレビューより】Excel取込（lib/actions/import-actions.ts）は
// クライアントから渡されたblobUrlをサーバー側でそのままfetch()していたが、
// Server Actionsは直接HTTPリクエストで呼び出せるため、UIを経由せず任意のURLを
// blobUrlとして渡すことが可能だった（SSRF＝サーバー側リクエスト偽装のリスク）。
// 内部ネットワークのURLやクラウドのメタデータエンドポイント等を指定されると、
// サーバーがそこへリクエストを送ってしまう恐れがある。
//
// @vercel/blob自身も、URLを受け取るAPI（例: del()）内部で同様に
// `hostname.endsWith(".blob.vercel-storage.com")`を検証している
// （node_modules/@vercel/blob/dist/index.js参照）。同じ考え方をExcel取込側にも
// 適用し、fetchする前に必ずこのチェックを通す。
export function isOwnBlobUrl(urlString: string): boolean {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
}
