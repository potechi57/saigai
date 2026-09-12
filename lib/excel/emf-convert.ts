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

// 様式Ａ・様式Ｂのシート上に重なって配置されている写真・図形・注記テキストを
// まとめて1枚のPNGとして取り込むための変換。
//
// 【なぜ個別の画像抽出ではなく範囲まるごと画像化するのか】
// 実データ（サンプルExcel複数件）を調査した結果、これらのシートには
// EMF/WMFスケッチの上に赤枠・注記テキスト・矢印・写真がdrawingMLの
// グループ図形として重ねて配置されており、写真だけを個別に抜き出す
// （karte-image-extract.tsの従来ロジック）ではこれらの重なりが失われることが
// わかった。セル範囲ごとPDF化→画像化すれば、載せる図形やテキストの数に
// 関わらず、見た目どおりに欠落なく取り込める。
//
// 【なぜ範囲をファイルごとに動的計算せず固定値にしているか】
// 当初はシート内の図形アンカーから範囲を動的に計算する案だったが、
// ファイルによって実際の内容の位置・広さが異なる（例: 左端がC列の
// ファイルもあればP列のファイルもある）ため、動的計算だと切り出し結果の
// 画像サイズ・内容の位置がファイルごとにばらついてしまう。全ファイルに
// 同じ固定範囲を使うことで、この見た目のばらつきを無くしている。
// 範囲は実データ4件（様式Ａ・様式Ｂ）の内容の和集合に余裕を持たせた値
//（詳細はコミット時の説明・会話ログ参照）。将来、この範囲を超える内容を
// 持つファイルが見つかった場合は、ここを調整する。
export const FORM_A_RANGE = "B6:CL30";

// 様式Ｂは「詳細スケッチ欄」（EMF/WMFスケッチに注記テキスト・図形が重なることが
// 多い）だけを対象にする。「写真張り付け欄」（詳細スケッチ欄より右側、実データで
// ほとんどの場合図形・テキストが重ねられていないことを確認済み）は、まとめて
// 画像化する必要が無いため対象外とし、従来どおり個別の写真抽出に任せる
// （karte-image-extract.tsのextractFormBImages参照。「詳細スケッチ欄を1枚の
// 合成画像＋写真張り付け欄の個別写真」という組み合わせになる）。
export const FORM_B_RANGE = "B7:AS42";
// 個別抽出した画像のうち、上記FORM_B_RANGEの右端列（AS）より右にアンカーされて
// いるものだけを「写真張り付け欄の写真」とみなし、合成画像と組み合わせる
// （extractFormBImages参照）。範囲を変更した場合はこちらも合わせて調整すること。
export const FORM_B_SKETCH_RANGE_END_COL_0INDEXED = 44; // AS列（1始まり45列目）の0始まり値

// xlsxバイト列（ファイル全体）の指定シート・指定範囲を1枚のPNGに変換する。
// convertEmfToPng同様、環境変数未設定・通信失敗時はnullを返すベストエフォート。
export async function convertSheetRangeToPng(
  xlsxBuffer: Buffer,
  sheetName: string,
  range: string
): Promise<Buffer | null> {
  const baseUrl = getConverterUrl();
  if (!baseUrl) return null;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/octet-stream" };
    const apiKey = process.env.EMF_CONVERTER_API_KEY;
    if (apiKey) headers["X-Api-Key"] = apiKey;

    const params = new URLSearchParams({ sheet: sheetName, range });
    const res = await fetch(`${baseUrl}/convert-range?${params.toString()}`, {
      method: "POST",
      headers,
      body: new Uint8Array(xlsxBuffer),
    });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}
