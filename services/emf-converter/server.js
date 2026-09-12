// EMF/WMF（ベクター形式のスケッチ画像）をPNGに変換するだけの、ごく小さなHTTPサーバー。
// Cloud Run上で動かし、防災カルテWebアプリ（Next.js、Vercel）のExcel取込処理から
// 呼び出される（lib/excel/emf-convert.ts参照）。
//
// 【なぜこのサーバーが必要か】
// EMF/WMFはWindows由来のベクター形式で、ブラウザはもちろんNode.js単体でも
// ラスタライズ（PNG化）する手段が無い。クラウド変換API（Aspose Cloud等）を使う
// 案もあったが、行政データを第三者サービスへ送信することになりセキュリティ上の
// 懸念があったため、県（または開発チーム）が管理するCloud Run上でLibreOffice
// headlessを動かし、変換処理を自前で完結させる方式にしている。
//
// 【なぜImageMagickではなくLibreOfficeか】
// ImageMagickのEMF対応は内部的にLibreOffice等の外部ツールに委譲する作りで、
// 特にLinux環境では変換に失敗する報告が多い（ImageMagick自体がEMF用の
// まともなネイティブデリゲートを持たないため）。素直にLibreOffice headlessを
// 直接使う方が確実。ただしImageMagick自体は、変換後のPNGの余白除去
// （-trim。下記convertToPng参照）という、EMF形式とは無関係な単純な
// PNG→PNG処理には問題なく使えるため、その用途でのみ併用している。
//
// 【想定する利用形態】
// - リクエスト頻度は低い（カルテExcel取込時、EMF/WMFスケッチが埋め込まれている
//   場合のみ）ため、Cloud Runの最小インスタンス数0（アイドル時課金ゼロ）を想定。
// - 1コンテナ内で複数のsoffice（LibreOffice本体）プロセスを同時に動かすと
//   不安定になりやすいため、Cloud Runのデプロイ時に`--concurrency=1`を
//   指定すること（README.md参照）。

const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { computeRangeCropInfo } = require("./printArea");

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY; // 未設定の場合は認証チェックをスキップ（ローカル動作確認用）
const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20MB。カルテに埋め込まれる1枚のスケッチとしては十分大きい上限
// /convert-rangeはxlsxファイル全体（埋め込み写真込み）を受け取るため、EMF単体より
// 大きくなりうる。取込元Excelの本体保存（lib/actions/import-actions.ts）と同程度の
// 余裕を見て50MBにしている。
const MAX_XLSX_BODY_BYTES = 50 * 1024 * 1024;
const CONVERT_TIMEOUT_MS = 30_000;
// xlsx→PDF変換は単純なEMF変換より重い処理（埋め込み写真のデコード等）になりうるため、
// 別途長めのタイムアウトを設ける。
const CONVERT_RANGE_TIMEOUT_MS = 90_000;
const ALLOWED_EXTENSIONS = new Set(["emf", "wmf"]);

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new HttpError(413, "ファイルサイズが上限を超えています"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function checkAuth(req) {
  if (!API_KEY) return; // API_KEY未設定時は認証なし（ローカル検証用途のみ想定。本番では必ず設定する）
  const header = req.headers["x-api-key"];
  if (header !== API_KEY) {
    throw new HttpError(401, "認証に失敗しました（X-Api-Keyヘッダーを確認してください）");
  }
}

// soffice（LibreOffice本体）を呼び出してEMF/WMF→PNG変換を行う。
// 呼び出しごとに専用の作業ディレクトリ・ユーザープロファイルを割り当てることで、
// 複数リクエストが同時に来た場合でもsofficeのプロファイルロック競合を避けている
// （既知の問題: 同じユーザープロファイルで複数のsofficeを同時起動すると
// 「他のインスタンスが実行中です」的なエラーで失敗する）。
async function convertToPng(inputBuffer, ext) {
  const workDir = path.join(os.tmpdir(), `emf-convert-${randomUUID()}`);
  const profileDir = path.join(workDir, "profile");
  const inputPath = path.join(workDir, `input.${ext}`);
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });
  await fs.writeFile(inputPath, inputBuffer);

  try {
    await new Promise((resolve, reject) => {
      execFile(
        "soffice",
        [
          "--headless",
          "--invisible",
          "--nologo",
          "--nofirststartwizard",
          `-env:UserInstallation=file://${profileDir}`,
          "--convert-to",
          "png",
          "--outdir",
          workDir,
          inputPath,
        ],
        { timeout: CONVERT_TIMEOUT_MS },
        (error, stdout, stderr) => {
          if (error) {
            reject(new HttpError(502, `変換に失敗しました: ${stderr || error.message}`));
            return;
          }
          resolve(undefined);
        }
      );
    });

    const outputPath = path.join(workDir, "input.png");

    // LibreOfficeはEMF/WMFを「描画ページ」として書き出すため、実際の絵よりも
    // 大きい既定サイズのキャンバスになり、絵が入っていない部分が白い余白として
    // 残ることがある（横長の絵なのに正方形に近いPNGになる、等）。ImageMagickの
    // -trimで背景と同色の外周を切り落とし、実際に描画された範囲だけを取り出す。
    const trimmedPath = path.join(workDir, "trimmed.png");
    try {
      await new Promise((resolve, reject) => {
        execFile(
          "convert",
          [outputPath, "-trim", "+repage", trimmedPath],
          { timeout: CONVERT_TIMEOUT_MS },
          (error) => (error ? reject(error) : resolve(undefined))
        );
      });
      return await fs.readFile(trimmedPath);
    } catch {
      // トリミングに失敗した場合（ImageMagick未導入・真っ白画像でtrim結果が
      // 空になる等）は、余白付きでも元の変換結果をそのまま返す（ベストエフォート）。
      return await fs.readFile(outputPath);
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function execFileAsync(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

const RANGE_RENDER_DPI = 300;

// xlsxの指定シート・指定セル範囲だけを1枚のPNGに変換する。防災カルテの
// 様式Ａ（点検地点位置図欄）・様式Ｂ（詳細スケッチ欄）は、EMF/WMFスケッチの上に
// 赤枠・注記テキスト・矢印・写真がグループ化されて重ねて配置されており、
// 画像を個別に抜き出すだけではこれらの重なりが失われる（実データで確認済み）。
//
// 【方式】xlsxファイル自体は書き換えず、calc_pdf_Exportの`SinglePageSheets`
// オプションでシート全体を1ページのPDFとして出力し、対象範囲がシート全体の
// 中で占める位置・大きさの比率（printArea.js参照）をもとにImageMagickの
// `-crop`で切り出す。Print_Area・pageSetup（scale/fitToWidth等）をxlsx側で
// 書き換える方式も試したが、LibreOfficeのヘッドレス変換ではこれらが
// 反映されない（実機検証で確認済み）ため、この比率ベースの切り出し方式にした。
async function convertRangeToPng(xlsxBuffer, sheetName, range) {
  const workDir = path.join(os.tmpdir(), `range-convert-${randomUUID()}`);
  const profileDir = path.join(workDir, "profile");
  const inputPath = path.join(workDir, "input.xlsx");
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });

  try {
    const cropInfo = await computeRangeCropInfo(xlsxBuffer, sheetName, range);
    await fs.writeFile(inputPath, xlsxBuffer);

    try {
      await execFileAsync(
        "soffice",
        [
          "--headless",
          "--invisible",
          "--nologo",
          "--nofirststartwizard",
          `-env:UserInstallation=file://${profileDir}`,
          "--convert-to",
          'pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}',
          "--outdir",
          workDir,
          inputPath,
        ],
        { timeout: CONVERT_RANGE_TIMEOUT_MS }
      );
    } catch ({ error, stderr }) {
      throw new HttpError(502, `PDF変換に失敗しました: ${stderr || error.message}`);
    }

    const pdfPath = path.join(workDir, "input.pdf");
    const pngPath = path.join(workDir, "result.png");
    const pdfPage = `${pdfPath}[${cropInfo.pdfPageIndex}]`;

    // 対象ページの用紙サイズ（pt）を取得する（ラスタライズせずMediaBoxを読むだけなので軽い）。
    let pageWidthPt;
    let pageHeightPt;
    try {
      const { stdout } = await execFileAsync("identify", ["-format", "%w %h", pdfPage], {
        timeout: CONVERT_RANGE_TIMEOUT_MS,
      });
      const [w, h] = stdout.trim().split(/\s+/).map(Number);
      if (!w || !h) throw new Error(`unexpected identify output: "${stdout}"`);
      pageWidthPt = w;
      pageHeightPt = h;
    } catch (e) {
      const detail = e && e.stderr ? e.stderr : e instanceof Error ? e.message : String(e);
      throw new HttpError(502, `PDFページサイズの取得に失敗しました: ${detail}`);
    }

    const pageWidthPx = (pageWidthPt * RANGE_RENDER_DPI) / 72;
    const pageHeightPx = (pageHeightPt * RANGE_RENDER_DPI) / 72;

    // SinglePageSheetsで1ページに収めた場合でも、シートのページ余白（pageMargins。
    // printArea.js参照）はそのまま保持される（実機検証で確認済み）。行・列の比率は
    // 「余白を除いた内容領域」に対する割合なので、切り出し位置の計算では
    // まずページ余白の分を差し引いた内容領域のサイズを求め、そこに比率を掛ける。
    // pageMarginsの単位はインチなので、DPIを掛けるだけでpx換算できる。
    const marginLeftPx = cropInfo.marginsIn.left * RANGE_RENDER_DPI;
    const marginRightPx = cropInfo.marginsIn.right * RANGE_RENDER_DPI;
    const marginTopPx = cropInfo.marginsIn.top * RANGE_RENDER_DPI;
    const marginBottomPx = cropInfo.marginsIn.bottom * RANGE_RENDER_DPI;
    const contentWidthPx = Math.max(1, pageWidthPx - marginLeftPx - marginRightPx);
    const contentHeightPx = Math.max(1, pageHeightPx - marginTopPx - marginBottomPx);

    // 列幅・行高が印刷範囲内で一様な（防災カルテのExcelで確認済み）場合、
    // printArea.jsの比率計算は理論上ぴったり一致するはずだが、浮動小数点の
    // 丸め等に備えてごく僅かな安全マージンだけ残す（以前は0.03だったが、
    // Print_Areaを基準にしたことで系統誤差自体が無くなったため大幅に縮小した）。
    const MARGIN_FRACTION = 0.003;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    const cropX = clamp(
      Math.round(marginLeftPx + (cropInfo.offsetXFraction - MARGIN_FRACTION) * contentWidthPx),
      0,
      pageWidthPx
    );
    const cropY = clamp(
      Math.round(marginTopPx + (cropInfo.offsetYFraction - MARGIN_FRACTION) * contentHeightPx),
      0,
      pageHeightPx
    );
    const cropRight = clamp(
      Math.round(
        marginLeftPx + (cropInfo.offsetXFraction + cropInfo.widthFraction + MARGIN_FRACTION) * contentWidthPx
      ),
      0,
      pageWidthPx
    );
    const cropBottom = clamp(
      Math.round(
        marginTopPx + (cropInfo.offsetYFraction + cropInfo.heightFraction + MARGIN_FRACTION) * contentHeightPx
      ),
      0,
      pageHeightPx
    );
    const cropWidth = Math.max(1, cropRight - cropX);
    const cropHeight = Math.max(1, cropBottom - cropY);

    try {
      await execFileAsync(
        "convert",
        [
          "-density",
          String(RANGE_RENDER_DPI),
          pdfPage,
          "-background",
          "white",
          "-flatten",
          "-crop",
          `${cropWidth}x${cropHeight}+${cropX}+${cropY}`,
          "+repage",
          "-trim",
          "+repage",
          pngPath,
        ],
        { timeout: CONVERT_RANGE_TIMEOUT_MS }
      );
    } catch ({ error, stderr }) {
      throw new HttpError(502, `PDF→PNG変換に失敗しました: ${stderr || error.message}`);
    }

    return await fs.readFile(pngPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    if (req.method !== "POST") {
      throw new HttpError(404, "not found");
    }

    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/convert-range") {
      checkAuth(req);
      const sheet = url.searchParams.get("sheet") || "";
      const range = url.searchParams.get("range") || "";
      if (!sheet) throw new HttpError(400, "?sheet=<シート名> を指定してください");
      if (!/^[A-Z]+\d+(:[A-Z]+\d+)?$/.test(range)) {
        throw new HttpError(400, `?range=<A1形式の範囲> を指定してください（受け取った値: "${range}"）`);
      }

      const body = await readBody(req, MAX_XLSX_BODY_BYTES);
      if (body.length === 0) {
        throw new HttpError(400, "リクエストボディが空です");
      }

      const png = await convertRangeToPng(body, sheet, range);
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length });
      res.end(png);
      return;
    }

    if (url.pathname !== "/convert") {
      throw new HttpError(404, "not found");
    }

    checkAuth(req);

    const ext = (url.searchParams.get("ext") || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new HttpError(400, `?ext=emf または ?ext=wmf を指定してください（受け取った値: "${ext}"）`);
    }

    const body = await readBody(req, MAX_BODY_BYTES);
    if (body.length === 0) {
      throw new HttpError(400, "リクエストボディが空です");
    }

    const png = await convertToPng(body, ext);
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length });
    res.end(png);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(err.message || "internal server error");
  }
});

server.listen(PORT, () => {
  console.log(`emf-converter listening on port ${PORT}`);
});
