"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// ホーム位置（県土整備事務所等、点検の起点となる拠点）の設定。
// ログイン機能が無いMVPのため、ユーザーごとではなく事務所で1つを共有するシングルトン行
// （AppSettings.id="singleton"）に保存する（prisma/schema.prismaのコメントも参照）。
// 地図上でのクリックからほぼ即座に呼ばれる想定のため、フォーム経由ではなく
// クライアントコンポーネント（components/MapView.tsx）から直接呼び出す通常の
// async関数として定義している（useActionStateは使わず、呼び出し側でPromiseを待つ）。

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export async function setHomeLocation(
  lat: number,
  lng: number,
  label?: string | null
): Promise<SettingsActionResult> {
  if (!isValidLatLng(lat, lng)) {
    return { ok: false, error: "緯度・経度の値が不正です。" };
  }
  try {
    await prisma.appSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", homeLatitude: lat, homeLongitude: lng, homeLabel: label || null },
      update: { homeLatitude: lat, homeLongitude: lng, homeLabel: label || null },
    });
  } catch (e) {
    return {
      ok: false,
      error: `ホーム位置の保存に失敗しました（詳細: ${e instanceof Error ? e.message : String(e)}）`,
    };
  }
  // マップだけでなく、他画面から距離を参照する可能性も見据えてカルテ配下全体を対象にする。
  revalidatePath("/karte", "layout");
  return { ok: true };
}

export async function clearHomeLocation(): Promise<SettingsActionResult> {
  try {
    await prisma.appSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", homeLatitude: null, homeLongitude: null, homeLabel: null },
      update: { homeLatitude: null, homeLongitude: null, homeLabel: null },
    });
  } catch (e) {
    return {
      ok: false,
      error: `ホーム位置の解除に失敗しました（詳細: ${e instanceof Error ? e.message : String(e)}）`,
    };
  }
  revalidatePath("/karte", "layout");
  return { ok: true };
}
