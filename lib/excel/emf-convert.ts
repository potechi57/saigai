// EMF/WMF（ベクター形式）をブラウザで表示できるPNGに変換する。
//
// 素のNode.js（Vercelのサーバーレス関数）には、EMFを直接ラスタライズする手段が無い。
// 候補を比較検討した結果（README「EMF対応について」参照）、以下の理由で
// 「自前で管理するCloud Run上でLibreOffice headlessを動かす」方式を採用している:
//   - ImageMagick+Ghostscript等のネイティブバイナリは50〜150MB超になりがちで、
//     Vercelの実行環境（サーバーレス関数）にそのまま載せることは非現実的。
//   - 純JSのEMFパーサー（例: emf-converter）はNode.js単体では動かず、結局
//     node-canvas（Cairo/Pango依存のネイティブバイナリ）が必要になり同じ問題を抱える。
//   - クラウド変換API（Aspose Cloud等）も検討したが、第三者セキュリティ認証
//     （SOC 2・ISO 27001等）を取得していないサービスへ行政（県）のデータを
//     送信することになるため見送った。
//   - 代わりに、自分たちで管理するGoogle Cloud Run上でLibreOffice headless
//     （soffice）を動かす小さなHTTPサーバー（`services/emf-converter/`）を用意し、
//     このモジュールからHTTP経由で呼び出す。変換対象のデータは自分たちが
//     管理するインフラの外へは出ない。
//
// このモジュールはExcel取込（lib/excel/karte-image-extract.ts経由）からのみ呼ばれ、
// 通常のカルテ閲覧・地図画面（クライアントに配信されるコード）には一切含まれない
// （"use server"経由のファイルからしかimportされないため、Next.jsのビルドが
// 自動的にクライアントバンドルから除外する。xlsx・officecrypto-toolと同じ扱い）。
//
// 【利用にはCloud Runサービスのデプロイが必要】
// services/emf-converter/README.md の手順に従ってGoogle Cloud Runへデプロイし、
// 発行されたURLと共有シークレットを環境変数 EMF_CONVERTER_URL / EMF_CONVERTER_API_KEY
// に設定する。未設定の環境（ローカル開発等）では、EMF/WMFの変換を単純にスキップする
// （呼び出し元は変換前と同じ「EMFは取り込まない」動作にフォールバックする）。

function getConverterUrl(): string | null {
  const url = process.env.EMF_CONVERTER_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

export function hasEmfConverterCredentials(): boolean {
  return Boolean(process.env.EMF_CONVERTER_URL);
}

// EMF/WMFのバイト列をPNGに変換する。環境変数が未設定・通信に失敗した等の場合は
// 例外を投げずnullを返す（呼び出し元は「その画像は取り込めなかった」として
// 単純にスキップする、というベストエフォート方針を維持するため）。
export async function convertEmfToPng(data: Buffer, sourceExt: "emf" | "wmf"): Promise<Buffer | null> {
  const baseUrl = getConverterUrl();
  if (!baseUrl) return null;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/octet-stream" };
    const apiKey = process.env.EMF_CONVERTER_API_KEY;
    if (apiKey) headers["X-Api-Key"] = apiKey;

    const res = await fetch(`${baseUrl}/convert?ext=${sourceExt}`, {
      method: "POST",
      headers,
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
