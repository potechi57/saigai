// アップロードされたファイルの元のファイル名を、Vercel Blobの保存パスに
// そのまま使わないようにするためのヘルパー。
//
// 【背景・セキュリティレビューより】facility-ledger-actions.ts・photo-actions.tsの
// 一部で、`file.name`（ブラウザから送られてくる、利用者が自由に設定できる文字列）を
// そのままBlobの保存パスに連結していた。gate-sign-inspection-actions.ts等、他の
// アップロード処理は元々このパターンを避け、タイムスタンプ等から生成した安全な
// ファイル名を使っており、一貫していなかった。他の処理と同じ方針に統一する。
//
// 拡張子はfile.name末尾からではなく、あらかじめ検証済みのMIMEタイプ（file.type。
// 呼び出し元で"image/"始まりであることを確認済み）から決める方が、細工された
// ファイル名の影響を受けず確実（例:"image/jpeg"→"jpeg"）。
export function safeImageExtension(file: File): string {
  const subtype = file.type.split("/")[1]?.toLowerCase() ?? "";
  const match = /^[a-z0-9]{1,10}$/.exec(subtype);
  if (match) return subtype === "jpeg" ? "jpg" : subtype;
  return "bin";
}
