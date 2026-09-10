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
// 直接使う方が確実。
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

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY; // 未設定の場合は認証チェックをスキップ（ローカル動作確認用）
const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20MB。カルテに埋め込まれる1枚のスケッチとしては十分大きい上限
const CONVERT_TIMEOUT_MS = 30_000;
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
    const png = await fs.readFile(outputPath);
    return png;
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

    if (req.method !== "POST" || !req.url.startsWith("/convert")) {
      throw new HttpError(404, "not found");
    }

    checkAuth(req);

    const url = new URL(req.url, "http://localhost");
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
