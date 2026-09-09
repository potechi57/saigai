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
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
