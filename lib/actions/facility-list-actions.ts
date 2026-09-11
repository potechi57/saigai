"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { findFacilityListSheetName, parseFacilityListSheet } from "@/lib/excel/facility-list-import";

// 「施設一覧」形式のExcel（施設管理台帳の出力）を取り込む。カルテのExcel取込
// （lib/actions/import-actions.ts）と違い、フラットな一覧表なのでBlobへの写真
// 保存等は無く、パースしてDBへupsertするだけの単純な処理になっている。
// 管理番号で一意に識別し、既存行があれば上書き更新する（再取込のたびに増え
// 続けることはない）。

export type ImportFacilityListResult =
  | { ok: true; created: number; updated: number; total: number }
  | { ok: false; error: string };

export async function importFacilityListExcel(
  _prevState: ImportFacilityListResult | null,
  formData: FormData
): Promise<ImportFacilityListResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ファイルが選択されていません。" };
  }

  let wb: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return { ok: false, error: "Excelファイルを読み込めませんでした。" };
  }

  const sheetName = findFacilityListSheetName(wb);
  if (!sheetName) {
    return {
      ok: false,
      error:
        "「施設一覧」形式のシートが見つかりませんでした（想定の位置に「管理番号」列が見つかりません）。島根県の施設管理データベースから出力された施設一覧のExcelか確認してください。",
    };
  }

  const items = parseFacilityListSheet(wb, sheetName);
  if (items.length === 0) {
    return { ok: false, error: "取り込めるデータ行が見つかりませんでした（管理番号が入った行がありません）。" };
  }

  let created = 0;
  let updated = 0;
  for (const item of items) {
    const existing = await prisma.facilityListItem.findUnique({
      where: { managementNo: item.managementNo },
      select: { id: true },
    });
    await prisma.facilityListItem.upsert({
      where: { managementNo: item.managementNo },
      create: item,
      update: item,
    });
    if (existing) updated++;
    else created++;
  }

  revalidatePath("/karte");
  revalidatePath("/facility-list");

  return { ok: true, created, updated, total: items.length };
}

export async function deleteFacilityListItem(id: string): Promise<void> {
  await prisma.facilityListItem.delete({ where: { id } });
  revalidatePath("/facility-list");
  revalidatePath("/karte");
}
