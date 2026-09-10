// EMF/WMF（ベクター形式）をブラウザで表示できるPNGに変換する。
//
// 素のNode.js（Vercelのサーバーレス関数）には、EMFを直接ラスタライズする手段が無い。
// 候補を比較検討した結果（README「EMF対応について」参照）、以下の理由でクラウド変換API
// （Aspose.Imaging Cloud）を採用している:
//   - ImageMagick+Ghostscript等のネイティブバイナリは50〜150MB超になりがちで、
//     Vercelの実行環境（Amazon Linux系）向けのビルドが別途必要になり非現実的。
//   - 純JSのEMFパーサー（例: emf-converter）はNode.js単体では動かず、結局
//     node-canvas（Cairo/Pango依存のネイティブバイナリ）が必要になり同じ問題を抱える。
//   - クラウドAPIならこちらのバンドルに含む依存はfetch呼び出しのみ（数百KB未満）で、
//     ネイティブバイナリ問題を回避できる（代わりに外部サービスへの課金・可用性依存が発生）。
//
// このモジュールはExcel取込（lib/excel/karte-image-extract.ts経由）からのみ呼ばれ、
// 通常のカルテ閲覧・地図画面（クライアントに配信されるコード）には一切含まれない
// （"use server"経由のファイルからしかimportされないため、Next.jsのビルドが
// 自動的にクライアントバンドルから除外する。xlsx・officecrypto-toolと同じ扱い）。
//
// 【利用にはAspose Cloudの無料アカウント登録が必要】
// https://dashboard.aspose.cloud/ でサインアップし、Client ID / Client Secretを
// 環境変数 ASPOSE_CLIENT_ID / ASPOSE_CLIENT_SECRET に設定する。
// 未設定の環境（ローカル開発等）では、EMF/WMFの変換を単純にスキップする
// （呼び出し元は変換前と同じ「EMFは取り込まない」動作にフォールバックする）。
//
// 【未検証の注記】Aspose.Imaging Cloudの実際のAPIキーでの動作確認はできていない
// （このプロジェクトの開発環境にAspose Cloudの契約が無いため）。エンドポイント・
// パラメータは公式ドキュメントに基づく実装だが、実際に有効なAPIキーで初回利用する際は
// 変換結果（特に変換後PNGの向き・背景の透過有無）を必ず目視確認すること。

const TOKEN_URL = "https://api.aspose.cloud/connect/token";
const CONVERT_URL = "https://api.aspose.cloud/v3/imaging/convert";

export function hasAsposeCredentials(): boolean {
  return Boolean(process.env.ASPOSE_CLIENT_ID && process.env.ASPOSE_CLIENT_SECRET);
}

// OAuth2のclient credentialsフローで取得するJWT。有効期限は応答のexpires_in（秒）に
// 従うが、複数画像を連続変換する際に毎回取り直さずに済むよう、プロセス内メモリに
// キャッシュする（Vercelのサーバーレス関数はインスタンスが使い回されることがあり、
// その間は再利用できる。使い回されなければ次回呼び出し時に取り直すだけで実害は無い）。
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const clientId = process.env.ASPOSE_CLIENT_ID;
  const clientSecret = process.env.ASPOSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    // 期限ギリギリでの失効を避けるため、実際の有効期限より60秒早く切れたことにする。
    const ttlMs = Math.max((json.expires_in ?? 3600) - 60, 60) * 1000;
    cachedToken = { value: json.access_token, expiresAt: Date.now() + ttlMs };
    return cachedToken.value;
  } catch {
    return null;
  }
}

// EMF/WMFのバイト列をPNGに変換する。認証情報が無い・通信に失敗した等の場合は
// 例外を投げずnullを返す（呼び出し元は「その画像は取り込めなかった」として
// 単純にスキップする、というベストエフォート方針を維持するため）。
export async function convertEmfToPng(data: Buffer, sourceExt: "emf" | "wmf"): Promise<Buffer | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${CONVERT_URL}?format=png`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": sourceExt === "emf" ? "image/x-emf" : "image/x-wmf",
        Accept: "application/octet-stream",
      },
      // Buffer<ArrayBufferLike>のままだとfetchのBodyInit型と噛み合わないため
      // （@types/nodeとDOM libの型定義の差異）、Uint8Arrayに変換して渡す。
      body: new Uint8Array(data),
    });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}
