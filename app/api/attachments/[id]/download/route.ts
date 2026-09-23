import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// カルテ資料（AttachmentDocument）のダウンロード用プロキシ。
//
// 【なぜ必要か】カルテ資料一覧（app/map/[karteNo]/page.tsx）は元々a.url
// （Vercel Blobの実URL）へ直接リンクしていたが、そのBlobの保存パスは
// アップロード経路によって以下のようにDB上の識別子・タイムスタンプ等が
// 混ざったものになっており、ブラウザがダウンロード時に提案するファイル名
// （＝URLの最後のパス部分）が「ランダムな英語」に見えてしまっていた
// （会話ログ「点検調書及び施設台帳がエクセルのものを出力するときに、
// 施設管理番号でファイル名を付けてほしい」参照。対象は現時点でカルテ資料のみ）。
//   - 大きいファイル（数MB。埋め込み写真を含む実際の防災カルテExcelで一般的）は
//     ブラウザから直接Blobへアップロードされる（components/ExcelImportForm.tsx）。
//     この時点ではサーバー側でExcelをまだ解析しておらず施設管理番号が分からない
//     ため、パスは`karte-imports/<タイムスタンプ>-<元のファイル名>`
//     （+Vercelが付与するランダムな接尾辞）になる。
// Blobの保存パス自体（＝AttachmentDocument.url）は変更せず、ダウンロード時に
// 見えるファイル名だけをこのルートで差し替える。サーバー側からBlobの中身を
// 取得し、Content-Dispositionヘッダーで施設管理番号ベースのファイル名を
// 明示的に指定して返す。
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const attachment = await prisma.attachmentDocument.findUnique({
    where: { id },
    select: { url: true, karte: { select: { facilityNo: true } } },
  });
  if (!attachment) {
    return NextResponse.json({ error: "資料が見つかりません" }, { status: 404 });
  }

  const upstream = await fetch(attachment.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "資料の取得に失敗しました" }, { status: 502 });
  }

  // 拡張子はBlobの実URL（アップロード時の元ファイル名由来）から取る。
  // AttachmentDocument.fileTypeは現状"xls"固定で保存されており、実データは
  // ほぼ.xlsxのため、拡張子の実態としては信頼できない（会話ログ・実データ確認）。
  const extMatch = attachment.url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = extMatch ? extMatch[1] : "xlsx";
  const fileName = `${attachment.karte.facilityNo}.${ext}`;

  const contentType =
    upstream.headers.get("content-type") ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      // encodeURIComponentでファイル名内の日本語・記号を安全にエンコードする
      // （filename*はRFC 5987形式。素のfilenameも併記し、対応していない
      // 古いブラウザでは後者にフォールバックさせる）。
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
