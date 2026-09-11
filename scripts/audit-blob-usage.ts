// Vercel Blobの使用状況を調査する、読み取り専用の診断スクリプト。
//
// 【目的】Blob使用量の内訳（カルテ単位・種別単位）と、DBのPhoto/AttachmentDocumentの
// どちらからも参照されていない「孤立Blob」を洗い出す。削除は一切行わない
// （孤立Blobの一覧をJSONファイルに書き出すところまでで止める）。
//
// 【背景】現在のExcel再取込処理は、写真（Photo）は`prisma.photo.deleteMany`で
// 古いDBレコードを消してから作り直すが、対応するVercel Blob上の実ファイルは
// 一度も`del()`されない（コードベース全体を検索して確認済み）。取込元Excel原本
// （AttachmentDocument）に至っては、再取込のたびに新しいBlobを作るだけで、
// 古いレコード自体を消す処理も無い。カルテ削除時（prisma.karte.delete）も、
// DB側はカスケード削除されるがBlobは残る。これらすべてが「孤立Blob」の発生源。
//
// 【実行方法】
// 調査対象の環境（本番ならVercel本番のBlob・DB）の認証情報を用意した上で:
//   BLOB_READ_WRITE_TOKEN と DATABASE_URL を環境変数に設定し
//   npx tsx scripts/audit-blob-usage.ts
// を実行する。本番の認証情報は `vercel env pull .env.production.local` 等で
// 取得し、`node --env-file=.env.production.local` 相当の方法で読み込ませるか、
// シェルで直接exportしてから実行する。
//
// 【出力】
// - 標準出力に、全体集計・種別ごとの内訳・カルテごとの内訳（上位）・
//   孤立Blob上位を表示する。
// - 孤立Blobの全件を `blob-audit-orphans.json` に書き出す（削除はしない。
//   内容を確認した上で、別途の削除スクリプトの入力として使うことを想定）。

import { list } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";

const prisma = new PrismaClient();

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

type BlobInfo = { url: string; pathname: string; size: number; uploadedAt: Date };

async function listAllBlobs(): Promise<BlobInfo[]> {
  const blobs: BlobInfo[] = [];
  let cursor: string | undefined;
  do {
    const res = await list({ cursor, limit: 1000 });
    blobs.push(...res.blobs);
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  return blobs;
}

// pathnameの先頭2セグメントで大まかな種別に分類する
// （例: "karte-imports/B3105A091-formA-....jpg" → "karte-imports"、
//   "karte-photos/B3105A091/xxx/....jpg" → "karte-photos"）。
function categoryOf(pathname: string): string {
  return pathname.split("/")[0] || "(unknown)";
}

async function main() {
  console.log("=".repeat(60));
  console.log("Vercel Blob 使用状況調査（読み取り専用・削除は行いません）");
  console.log("=".repeat(60));

  console.log("\n[1/3] Vercel Blobの一覧を取得しています...");
  const blobs = await listAllBlobs();
  const totalBytes = blobs.reduce((s, b) => s + b.size, 0);
  console.log(`  Blob総数: ${blobs.length}件 / 合計サイズ: ${formatBytes(totalBytes)}`);

  console.log("\n[2/3] DBから参照されているURLを取得しています...");
  const [photos, attachments, karteCount] = await Promise.all([
    prisma.photo.findMany({ select: { url: true, karteId: true, sourceForm: true } }),
    prisma.attachmentDocument.findMany({ select: { url: true, karteId: true, title: true } }),
    prisma.karte.count(),
  ]);
  const referencedUrls = new Set<string>([...photos.map((p) => p.url), ...attachments.map((a) => a.url)]);
  console.log(`  カルテ数: ${karteCount}件`);
  console.log(`  Photoレコード数: ${photos.length}件 / AttachmentDocumentレコード数: ${attachments.length}件`);
  console.log(`  DBが参照しているユニークURL数: ${referencedUrls.size}件`);

  console.log("\n[3/3] 突き合わせています...");
  const referenced = blobs.filter((b) => referencedUrls.has(b.url));
  const orphans = blobs.filter((b) => !referencedUrls.has(b.url));
  const referencedBytes = referenced.reduce((s, b) => s + b.size, 0);
  const orphanBytes = orphans.reduce((s, b) => s + b.size, 0);

  console.log("\n" + "-".repeat(60));
  console.log("■ 全体サマリー");
  console.log("-".repeat(60));
  console.log(`  参照あり（DBのPhoto/AttachmentDocumentが指している）: ${referenced.length}件 / ${formatBytes(referencedBytes)}`);
  console.log(`  参照なし（孤立。DBのどこからも指されていない）    : ${orphans.length}件 / ${formatBytes(orphanBytes)}`);
  if (totalBytes > 0) {
    console.log(`  孤立Blobの割合: ${((orphanBytes / totalBytes) * 100).toFixed(1)}%`);
  }
  if (karteCount > 0) {
    console.log(`  カルテ1件あたりの平均（Blob総量ベース）: ${formatBytes(totalBytes / karteCount)}`);
    console.log(`  カルテ1件あたりの平均（参照分のみ）      : ${formatBytes(referencedBytes / karteCount)}`);
  }

  console.log("\n" + "-".repeat(60));
  console.log("■ 種別ごとの内訳（Blobのパス先頭セグメント別）");
  console.log("-".repeat(60));
  const byCategory = new Map<string, { count: number; bytes: number; orphanCount: number; orphanBytes: number }>();
  for (const b of blobs) {
    const cat = categoryOf(b.pathname);
    const cur = byCategory.get(cat) ?? { count: 0, bytes: 0, orphanCount: 0, orphanBytes: 0 };
    cur.count++;
    cur.bytes += b.size;
    if (!referencedUrls.has(b.url)) {
      cur.orphanCount++;
      cur.orphanBytes += b.size;
    }
    byCategory.set(cat, cur);
  }
  for (const [cat, v] of [...byCategory.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(
      `  ${cat.padEnd(20)} 総数:${String(v.count).padStart(5)}件 ${formatBytes(v.bytes).padStart(10)}` +
        `  (うち孤立:${String(v.orphanCount).padStart(5)}件 ${formatBytes(v.orphanBytes).padStart(10)})`
    );
  }

  console.log("\n" + "-".repeat(60));
  console.log("■ Photo sourceFormごとの件数（DB上のレコード数。1カルテあたりの内訳の参考）");
  console.log("-".repeat(60));
  const bySourceForm = new Map<string, number>();
  for (const p of photos) {
    bySourceForm.set(p.sourceForm, (bySourceForm.get(p.sourceForm) ?? 0) + 1);
  }
  for (const [form, count] of [...bySourceForm.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${form.padEnd(16)} ${count}件（カルテ${karteCount}件で割ると平均 ${(count / karteCount).toFixed(1)}件/カルテ）`);
  }
  console.log(`  AttachmentDocument（取込元Excel等） ${attachments.length}件（平均 ${(attachments.length / karteCount).toFixed(1)}件/カルテ）`);

  console.log("\n" + "-".repeat(60));
  console.log("■ カルテごとの内訳（参照されているBlobの合計サイズが大きい順、上位20件）");
  console.log("-".repeat(60));
  const sizeByUrl = new Map(blobs.map((b) => [b.url, b.size]));
  const byKarte = new Map<string, { photoCount: number; attachmentCount: number; bytes: number }>();
  for (const p of photos) {
    const cur = byKarte.get(p.karteId) ?? { photoCount: 0, attachmentCount: 0, bytes: 0 };
    cur.photoCount++;
    cur.bytes += sizeByUrl.get(p.url) ?? 0;
    byKarte.set(p.karteId, cur);
  }
  for (const a of attachments) {
    const cur = byKarte.get(a.karteId) ?? { photoCount: 0, attachmentCount: 0, bytes: 0 };
    cur.attachmentCount++;
    cur.bytes += sizeByUrl.get(a.url) ?? 0;
    byKarte.set(a.karteId, cur);
  }
  const karteIds = [...byKarte.keys()];
  const kartes = await prisma.karte.findMany({
    where: { id: { in: karteIds } },
    select: { id: true, facilityNo: true, routeName: true },
  });
  const karteById = new Map(kartes.map((k) => [k.id, k]));
  const rankedKartes = [...byKarte.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 20);
  for (const [karteId, v] of rankedKartes) {
    const k = karteById.get(karteId);
    console.log(
      `  ${(k?.facilityNo ?? karteId).padEnd(14)} 写真${String(v.photoCount).padStart(3)}件 + 資料${v.attachmentCount}件` +
        ` = ${formatBytes(v.bytes).padStart(10)}  （${k?.routeName ?? ""}）`
    );
  }

  console.log("\n" + "-".repeat(60));
  console.log("■ 孤立Blob 上位30件（サイズ順）");
  console.log("-".repeat(60));
  const topOrphans = [...orphans].sort((a, b) => b.size - a.size).slice(0, 30);
  for (const b of topOrphans) {
    console.log(`  ${formatBytes(b.size).padStart(10)}  ${b.uploadedAt.toISOString().slice(0, 10)}  ${b.pathname}`);
  }

  const outPath = "blob-audit-orphans.json";
  await writeFile(
    outPath,
    JSON.stringify(
      orphans.map((b) => ({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt })),
      null,
      2
    )
  );
  console.log(`\n孤立Blob ${orphans.length}件の全一覧を ${outPath} に書き出しました。`);
  console.log("（このスクリプトは削除を一切行いません。内容を確認の上、別途の削除スクリプトの入力にしてください。）");
}

main()
  .catch((err) => {
    console.error("エラーが発生しました:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
