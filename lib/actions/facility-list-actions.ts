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
    const {
      inspectionType,
      soundnessGrade,
      inspectionDate,
      inspector,
      mainFindings,
      repairDate,
      repairRemarks,
      ...assetFields
    } = item;

    const existing = await prisma.facilityListItem.findUnique({
      where: { managementNo: item.managementNo },
      select: { id: true, inspectionDate: true },
    });

    // 台帳本体（施設諸元）は常に最新の取込内容で上書きするが、「直近点検」の
    // スナップショットは、今回の行の点検実施日が既存のスナップショットより
    // 古い場合は上書きしない（例: 過去の古いエクスポートを後から誤って再取込
    // した場合に、一覧・地図表示の「直近点検」が古い内容へ後退するのを防ぐ）。
    // 点検記録の履歴（下記FacilityInspectionRecord）自体は、日付にかかわらず
    // 常にそのまま記録する（過去の点検として履歴に残ればよいため）。
    const shouldUpdateSnapshot =
      !existing || !existing.inspectionDate || (inspectionDate != null && inspectionDate >= existing.inspectionDate);
    const snapshotFields = shouldUpdateSnapshot
      ? { inspectionType, soundnessGrade, inspectionDate, inspector, mainFindings, repairDate, repairRemarks }
      : {};

    // 台帳本体の更新と、点検記録の履歴への追加は、途中で失敗した場合に片方だけ
    // 反映されて食い違うことがないよう、1つのトランザクションにまとめる
    // （インタラクティブトランザクションを使うのは、新規行の場合、点検記録側の
    // facilityListItemIdが台帳作成の結果を見るまで確定しないため。行ごとに
    // 短いトランザクションにとどめ、大量データの取込でも1件のトランザクションが
    // 長時間かかることがないようにしている）。
    await prisma.$transaction(async (tx) => {
      const saved = await tx.facilityListItem.upsert({
        where: { managementNo: item.managementNo },
        create: item,
        update: { ...assetFields, ...snapshotFields },
      });

      // 点検実施日が入っている行だけ、点検記録の履歴にも積む（未点検の行は対象外）。
      if (inspectionDate) {
        await tx.facilityInspectionRecord.upsert({
          where: {
            facilityListItemId_inspectionDate: { facilityListItemId: saved.id, inspectionDate },
          },
          create: {
            facilityListItemId: saved.id,
            inspectionType,
            soundnessGrade,
            inspectionDate,
            inspector,
            mainFindings,
            repairDate,
            repairRemarks,
          },
          // 同じ施設×同じ点検日の記録が既にある場合（同じファイルの再取込等）は、
          // 内容だけ最新化する（新しい行は増やさない）。
          update: { inspectionType, soundnessGrade, inspector, mainFindings, repairDate, repairRemarks },
        });
      }
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
