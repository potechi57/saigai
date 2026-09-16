"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isRoadTypeGroupKey } from "@/lib/road-type-groups";

// 点検調書（防災＝Karte）の路線名に、利用者が手動で道路種別を割り当てる
// （会話ログ「道路種別が決まっていない道路を手動で分類できる仕様」参照）。
// components/RouteRoadTypeSettingsForm.tsxから、選択が変わるたびに即座に
// 呼び出す想定（settings-actions.tsのsetHomeLocationと同じ、フォーム送信では
// なく通常の関数呼び出しのパターン）。

export type RouteRoadTypeActionResult = { ok: true } | { ok: false; error: string };

export async function setRouteRoadType(routeName: string, roadTypeGroup: string): Promise<RouteRoadTypeActionResult> {
  const trimmed = routeName.trim();
  if (!trimmed) {
    return { ok: false, error: "路線名が不正です。" };
  }
  if (!isRoadTypeGroupKey(roadTypeGroup)) {
    return { ok: false, error: "道路種別の値が不正です。" };
  }
  try {
    await prisma.routeRoadTypeOverride.upsert({
      where: { routeName: trimmed },
      create: { routeName: trimmed, roadTypeGroup },
      update: { roadTypeGroup },
    });
  } catch (e) {
    return {
      ok: false,
      error: `道路種別の保存に失敗しました（詳細: ${e instanceof Error ? e.message : String(e)}）`,
    };
  }
  // 検索・地図画面（路線名の2段階絞り込み・表示プレフィックス）とカルテ詳細画面
  // （路線名の表示）の両方に反映させる。lib/reference-data.tsのgetRouteRoadTypeOverrides
  // は30秒キャッシュしているため、revalidateTagで即座に反映させる。
  revalidatePath("/karte", "layout");
  revalidatePath("/settings");
  revalidateTag("reference-data", "max");
  return { ok: true };
}

// 「未分類」に戻す（上書きを削除する）。
export async function clearRouteRoadType(routeName: string): Promise<RouteRoadTypeActionResult> {
  const trimmed = routeName.trim();
  if (!trimmed) {
    return { ok: false, error: "路線名が不正です。" };
  }
  try {
    await prisma.routeRoadTypeOverride.deleteMany({ where: { routeName: trimmed } });
  } catch (e) {
    return {
      ok: false,
      error: `道路種別の削除に失敗しました（詳細: ${e instanceof Error ? e.message : String(e)}）`,
    };
  }
  revalidatePath("/karte", "layout");
  revalidatePath("/settings");
  revalidateTag("reference-data", "max");
  return { ok: true };
}
