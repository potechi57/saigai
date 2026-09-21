"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// 点検調書（門型標識・橋梁・法面構造物）の判定区分／点検者の評価を、Excel再取込み
// なしで直接更新する機能（会話ログ「カルテ以外への対応区分・判定区分の直接更新
// 機能」参照）。カルテ（Karte.responseCategory）はKarteForm経由のフル編集フォームで
// 更新できるが、これら3種はExcel取込専用で編集UIが無く、現地確認後の再評価等を
// 反映する手段が無かった（判定を変えたいだけのために、値を書き換えたExcelを
// 作り直して再取込みする必要があった）。
//
// FavoriteTarget（lib/actions/favorite-actions.ts）と同じ、対象種別を区別する
// discriminated unionにしている。年度別履歴チェーンの「過去年度の記録」
// （supersededByInspectionが設定されている行）は編集不可とし、常に「現在有効な
// 最新レコード」だけを更新対象にする（呼び出し側の詳細画面で、過去年度の記録では
// この編集フォーム自体を出さないことでも二重に防止する）。
export type JudgmentTarget =
  | { type: "gateSignInspection"; id: string; title: string }
  | { type: "bridgeInspection"; id: string; title: string }
  | { type: "slopeStructureInspection"; id: string; title: string };

export type UpdateJudgmentResult = { ok: true } | { ok: false; error: string };

export async function updateJudgment(target: JudgmentTarget, value: string): Promise<UpdateJudgmentResult> {
  try {
    if (target.type === "gateSignInspection") {
      await prisma.gateSignInspection.update({ where: { id: target.id }, data: { overallJudgment: value } });
      revalidatePath(`/inspections/gate-signs/${target.id}`);
      revalidatePath("/inspections/gate-signs");
    } else if (target.type === "bridgeInspection") {
      await prisma.bridgeInspection.update({ where: { id: target.id }, data: { overallJudgment: value } });
      revalidatePath(`/inspections/bridges/${target.id}`);
      revalidatePath("/inspections/bridges");
    } else {
      await prisma.slopeStructureInspection.update({ where: { id: target.id }, data: { overallJudgment: value } });
      revalidatePath(`/inspections/slopes/${target.id}`);
      revalidatePath("/inspections/slopes");
    }
  } catch (e) {
    return { ok: false, error: `判定区分の更新に失敗しました（詳細: ${e instanceof Error ? e.message : String(e)}）` };
  }

  const entityType =
    target.type === "gateSignInspection" ? "点検調書（門型標識）" : target.type === "bridgeInspection" ? "点検調書（橋梁）" : "点検調書（法面構造物）";
  const linkHref =
    target.type === "gateSignInspection"
      ? `/inspections/gate-signs/${target.id}`
      : target.type === "bridgeInspection"
        ? `/inspections/bridges/${target.id}`
        : `/inspections/slopes/${target.id}`;
  await logAudit({
    action: "UPDATE",
    entityType,
    summary: `${target.title}の判定区分を「${value}」に手動更新`,
    linkHref,
  });

  revalidatePath("/karte");
  return { ok: true };
}
