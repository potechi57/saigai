"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { findFacilityListSheetName, parseFacilityListSheet } from "@/lib/excel/facility-list-import";

// 「施設一覧」形式のExcel（施設管理台帳の出力）を取り込む。カルテのExcel取込
// （lib/actions/import-actions.ts）と違い、フラットな一覧表なのでBlobへの写真
// 保存等は無く、パースしてDBへupsertするだけの単純な処理になっている。
// 管理番号で一意に識別し、既存行（台帳本体＝施設諸元＋直近点検のスナップショット）
// があれば上書き更新する（再取込のたびに増え続けることはない）。
//
// ただし点検記録（行の中の点検種別・健全度・点検実施日・点検実施者・主な所見・
// 修繕記録）は、台帳とは別にFacilityInspectionRecordとして履歴を積み上げる
// （施設×点検日で一意。カルテのInspectionEvent[karteId, inspectionDate]と同じ
// 考え方）。構造物は施工時に台帳がまず存在し、点検は後から・繰り返し行われる
// ものであるため、再取込のたびに直近の点検記録で上書きするだけでは、それ以前の
// 点検記録が失われてしまう（prisma/schema.prismaのFacilityListItem/
// FacilityInspectionRecordコメント参照）。

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
    const saved = await prisma.facilityListItem.upsert({
      where: { managementNo: item.managementNo },
      create: item,
      update: item,
    });
    if (existing) updated++;
    else created++;

    // 点検実施日が入っている行だけ、点検記録の履歴にも積む（未点検の行は対象外）。
    if (item.inspectionDate) {
      await prisma.facilityInspectionRecord.upsert({
        where: {
          facilityListItemId_inspectionDate: {
            facilityListItemId: saved.id,
            inspectionDate: item.inspectionDate,
          },
        },
        create: {
          facilityListItemId: saved.id,
          inspectionType: item.inspectionType,
          soundnessGrade: item.soundnessGrade,
          inspectionDate: item.inspectionDate,
          inspector: item.inspector,
          mainFindings: item.mainFindings,
          repairDate: item.repairDate,
          repairRemarks: item.repairRemarks,
        },
        // 同じ施設×同じ点検日の記録が既にある場合（同じファイルの再取込等）は、
        // 内容だけ最新化する（新しい行は増やさない）。
        update: {
          inspectionType: item.inspectionType,
          soundnessGrade: item.soundnessGrade,
          inspector: item.inspector,
          mainFindings: item.mainFindings,
          repairDate: item.repairDate,
          repairRemarks: item.repairRemarks,
        },
      });
    }
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
