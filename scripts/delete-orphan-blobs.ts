// scripts/audit-blob-usage.ts で見つかった「孤立Blob」（DBのPhoto/
// AttachmentDocumentのどちらからも参照されていないBlob）を実際に削除する
// スクリプト。破壊的な操作のため、既定では削除対象を表示するだけの
// ドライラン動作にしている。実際に削除するには --yes を明示的に付ける。
//
// 【安全のための工夫】
// - blob-audit-usage.tsが書き出したJSON（blob-audit-orphans.json）の
//   URL一覧をそのまま信用せず、実行直前にDBを再取得し「今この瞬間も
//   本当に孤立しているか」を再確認してから削除する（実行の合間に別の
//   インポート等でURLが参照されるようになっていた場合の事故を防ぐ）。
// - 既定はドライラン（--yesを付けない限り実際には削除しない）。
// - 削除前に対象の件数・合計サイズを表示し、--yes無しなら必ずそこで停止する。
//
// 【実行方法】
//   1. まずドライランで対象を確認する:
//      BLOB_READ_WRITE_TOKEN="..." DATABASE_URL="..." npx tsx scripts/delete-orphan-blobs.ts
//   2. 内容に問題なければ、実際に削除する:
//      BLOB_READ_WRITE_TOKEN="..." DATABASE_URL="..." npx tsx scripts/delete-orphan-blobs.ts --yes

import { list, del } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes("--yes");

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

async function main() {
  console.log("=".repeat(60));
  console.log(`孤立Blob削除スクリプト（${DRY_RUN ? "ドライラン。実際には削除しません" : "本実行。実際に削除します"}）`);
  console.log("=".repeat(60));

  console.log("\n現時点のBlob一覧とDB参照URLを取得しています...");
  const [blobs, photos, attachments] = await Promise.all([
    listAllBlobs(),
    prisma.photo.findMany({ select: { url: true } }),
    prisma.attachmentDocument.findMany({ select: { url: true } }),
  ]);
  const referencedUrls = new Set<string>([...photos.map((p) => p.url), ...attachments.map((a) => a.url)]);
  const orphans = blobs.filter((b) => !referencedUrls.has(b.url));
  const totalBytes = orphans.reduce((s, b) => s + b.size, 0);

  console.log(`\n削除対象（現時点で孤立しているBlob）: ${orphans.length}件 / ${formatBytes(totalBytes)}`);

  if (orphans.length === 0) {
    console.log("削除対象はありません。");
    return;
  }

  if (DRY_RUN) {
    console.log("\n--- 削除対象の一部（最大20件） ---");
    for (const b of orphans.slice(0, 20)) {
      console.log(`  ${formatBytes(b.size).padStart(10)}  ${b.pathname}`);
    }
    console.log(`\nこれはドライランです。実際に削除するには --yes を付けて再実行してください。`);
    return;
  }

  console.log("\n削除を開始します...");
  // delは複数URLをまとめて渡せるが、失敗時にどれが原因か分かりやすいよう
  // ある程度の件数ごとに区切って呼び出す。
  const BATCH_SIZE = 50;
  let deletedCount = 0;
  let deletedBytes = 0;
  let failedCount = 0;
  for (let i = 0; i < orphans.length; i += BATCH_SIZE) {
    const batch = orphans.slice(i, i + BATCH_SIZE);
    try {
      await del(batch.map((b) => b.url));
      deletedCount += batch.length;
      deletedBytes += batch.reduce((s, b) => s + b.size, 0);
      console.log(`  ${deletedCount}/${orphans.length}件 削除済み...`);
    } catch (err) {
      failedCount += batch.length;
      console.error(`  バッチ削除に失敗しました（${batch.length}件分をスキップ）:`, err);
    }
  }

  console.log("\n" + "-".repeat(60));
  console.log(`削除完了: ${deletedCount}件 / ${formatBytes(deletedBytes)} を削除しました。`);
  if (failedCount > 0) {
    console.log(`失敗: ${failedCount}件（再度このスクリプトを実行すれば再試行されます）`);
  }
}

main()
  .catch((err) => {
    console.error("エラーが発生しました:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
