"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { findFacilityListSheetName, parseFacilityListSheet } from "@/lib/excel/facility-list-import";
import { logAudit } from "@/lib/audit";

// 「施設一覧」形式のExcel（施設管理台帳の出力）を取り込む。カルテのExcel取込
// （lib/actions/import-actions.ts）と違い、フラットな一覧表なのでBlobへの写真
// 保存等は無く、パースしてDBへupsertするだけの単純な処理になっている。
// 管理番号で一意に識別し、既存行（台帳本体＝施設諸元＋直近点検のスナップショット）
// があれば上書き更新する（再取込のたびに増え続けることはない）。
//
// かつては行の中の点検種別・健全度・点検実施日・点検実施者・主な所見・修繕記録を
// FacilityInspectionRecordとして別テーブルに履歴として積み上げていたが、
// 運用上不要となったため削除した（会話ログ「点検記録は不要」参照）。現在は
// 台帳本体（FacilityListItem）側の「直近点検」スナップショットのみ更新する。

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
    const shouldUpdateSnapshot =
      !existing || !existing.inspectionDate || (inspectionDate != null && inspectionDate >= existing.inspectionDate);
    const snapshotFields = shouldUpdateSnapshot
      ? { inspectionType, soundnessGrade, inspectionDate, inspector, mainFindings, repairDate, repairRemarks }
      : {};

    await prisma.facilityListItem.upsert({
      where: { managementNo: item.managementNo },
      create: item,
      update: { ...assetFields, ...snapshotFields },
    });
    if (existing) updated++;
    else created++;
  }

  revalidatePath("/karte");
  revalidatePath("/facility-list");

  // 編集履歴（/karte/history）には行ごとではなく取込1回につき1件だけ記録する
  // （数百行に及ぶこともあるExcel取込で、行単位に記録すると履歴が埋め尽くされて
  // しまうため。カルテのExcel取込＝lib/actions/import-actions.tsと同じ方針）。
  // 取込結果は一覧画面へのリンクにする（複数施設にまたがるため特定の1件には
  // 紐付けられない）。
  await logAudit({
    action: "UPDATE",
    entityType: "施設台帳",
    summary: `施設一覧Excel（${file.name}）を取込（新規${created}件・更新${updated}件）`,
    linkHref: "/facility-list",
  });

  return { ok: true, created, updated, total: items.length };
}

export async function deleteFacilityListItem(id: string): Promise<void> {
  const item = await prisma.facilityListItem.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "施設台帳",
    summary: `${item.managementNo}を削除`,
  });
  revalidatePath("/facility-list");
  revalidatePath("/karte");
}
