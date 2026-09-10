import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@prisma/client";

// 編集履歴（ヘッダーの「編集履歴」画面から確認できる、直近の編集操作一覧）用の
// 簡易監査ログ記録ヘルパー。ログイン機能が無いMVPのため「誰が」は記録できず、
// 「いつ・何を・どう変更したか」の短いサマリ文字列のみを記録する
// （詳細な差分やロールバック機能までは持たない）。
//
// 呼び出し側（各Server Action）の本来の処理（カルテの保存等）を、監査ログの
// 記録失敗で巻き込んで失敗させたくないため、この関数の中で例外を握りつぶす
// （ログが1件欠けるより、保存自体が失敗する方が業務上ずっと悪いため）。
export async function logAudit(entry: {
  action: AuditAction;
  entityType: string; // 例:「カルテ」「点検対象」「点検記録」「Excel取込」
  summary: string; // 例:「サンプル県道１号線（SAMPLE-0001）を更新」
  karteFacilityNo?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        summary: entry.summary,
        karteFacilityNo: entry.karteFacilityNo ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] 編集履歴の記録に失敗しました（処理は続行します）:", e);
  }
}
