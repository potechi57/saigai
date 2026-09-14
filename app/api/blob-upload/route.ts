import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

// 防災カルテExcelの取込用。写真が埋め込まれた実データは数MBになることが多く、
// Server Action（ひいてはVercel Functions）のリクエストサイズ上限に収まらないため、
// ブラウザからVercel Blobへ直接アップロードする経路を用意する
// （実体はブラウザ→Blobへ直接PUTされ、このAPIルートはトークン発行だけを担う。
// 詳細はlib/actions/import-actions.tsとcomponents/ExcelImportForm.tsxのコメント参照）。
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
        addRandomSuffix: true,
        // セキュリティレビューより: 上限が無いと、未認証のまま無制限サイズの
        // アップロードトークンを発行できてしまう（allowedContentTypesはクライアント
        // 申告値のため実質的な検証にならない）。実際の防災カルテExcel（写真埋め込み）
        // は数MB〜10MB程度（README「大きいファイルのアップロード」参照）のため、
        // 余裕を持たせつつ上限を設ける。
        maximumSizeInBytes: 50 * 1024 * 1024, // 50MB
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
