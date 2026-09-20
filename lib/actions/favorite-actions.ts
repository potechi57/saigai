"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// お気に入り機能。ログイン機能が無いMVPのため、ユーザーごとではなく事務所全体で
// 共有する1つのお気に入りリストとして実装する（prisma/schema.prismaのコメント参照）。

export type FavoriteActionResult = { ok: true } | { ok: false; error: string };

// お気に入りの対象。当初はKarte（防災カルテ）専用だったが、「お気に入り追加は
// カルテのみでは意味がありません。点検調書の項目すべてに適用できるように
// してください」との指摘を受け、対象種別を区別できるdiscriminated unionにした
// （prisma/schema.prismaのFavoriteモデルのコメント参照）。今後、他の点検調書
// 種別（橋梁等）が地図・検索に組み込まれた際は、この union に type を追加し、
// 下記の分岐にケースを1つ足す形で対応する。
export type FavoriteTarget =
  | { type: "karte"; id: string; facilityNo: string }
  | { type: "gateSignInspection"; id: string }
  | { type: "bridgeInspection"; id: string }
  | { type: "bridgeLedger"; id: string };

// カルテ詳細画面・地図のポップアップ・検索結果一覧など、複数箇所にある
// ☆/★ボタンから直接呼ばれる（フォーム経由ではなく、クライアント側でawaitして
// 結果に応じて表示を更新する）。現在の状態を見て追加/解除を切り替えるのではなく、
// 呼び出し側が次の状態を明示的に指定する方式にして、連打による状態のズレを防ぐ。
export async function setFavorite(target: FavoriteTarget, shouldBeFavorite: boolean): Promise<FavoriteActionResult> {
  try {
    if (target.type === "karte") {
      if (shouldBeFavorite) {
        await prisma.favorite.upsert({ where: { karteId: target.id }, create: { karteId: target.id }, update: {} });
      } else {
        // 存在しない場合にdeleteするとPrismaがエラーを投げるため、deleteManyで無害化する
        await prisma.favorite.deleteMany({ where: { karteId: target.id } });
      }
    } else if (target.type === "gateSignInspection") {
      if (shouldBeFavorite) {
        await prisma.favorite.upsert({
          where: { gateSignInspectionId: target.id },
          create: { gateSignInspectionId: target.id },
          update: {},
        });
      } else {
        await prisma.favorite.deleteMany({ where: { gateSignInspectionId: target.id } });
      }
    } else if (target.type === "bridgeInspection") {
      if (shouldBeFavorite) {
        await prisma.favorite.upsert({
          where: { bridgeInspectionId: target.id },
          create: { bridgeInspectionId: target.id },
          update: {},
        });
      } else {
        await prisma.favorite.deleteMany({ where: { bridgeInspectionId: target.id } });
      }
    } else {
      if (shouldBeFavorite) {
        await prisma.favorite.upsert({
          where: { bridgeLedgerId: target.id },
          create: { bridgeLedgerId: target.id },
          update: {},
        });
      } else {
        await prisma.favorite.deleteMany({ where: { bridgeLedgerId: target.id } });
      }
    }
  } catch (e) {
    return {
      ok: false,
      error: `お気に入りの更新に失敗しました（詳細: ${e instanceof Error ? e.message : String(e)}）`,
    };
  }
  if (target.type === "karte") {
    revalidatePath(`/karte/${target.facilityNo}`);
    revalidatePath("/karte");
    revalidatePath("/karte/favorites");
    revalidatePath(`/m/${target.facilityNo}`); // 現場向け画面（/m）の★ボタンからも呼ばれるため
    revalidatePath("/m/favorites");
  } else if (target.type === "gateSignInspection") {
    revalidatePath(`/inspections/gate-signs/${target.id}`);
    revalidatePath("/karte"); // 地図（点検調書＞道路＞門型標識）のポップアップの★表示を更新するため
    revalidatePath("/karte/favorites");
    revalidatePath("/m/favorites");
  } else if (target.type === "bridgeInspection") {
    revalidatePath(`/inspections/bridges/${target.id}`);
    revalidatePath("/karte");
    revalidatePath("/karte/favorites");
    revalidatePath("/m/favorites");
  } else {
    revalidatePath(`/bridge-ledgers/${target.id}`);
    revalidatePath("/karte");
    revalidatePath("/karte/favorites");
    revalidatePath("/m/favorites");
  }
  return { ok: true };
}

export async function createFavoriteGroup(_prevState: FavoriteActionResult | null, formData: FormData): Promise<FavoriteActionResult> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "グループ名を入力してください。" };
  }
  try {
    await prisma.favoriteGroup.create({ data: { name: name.trim() } });
  } catch (e) {
    // @@unique([name]) 違反（同名グループが既にある）を分かりやすいメッセージにする
    const detail = e instanceof Error ? e.message : String(e);
    if (detail.includes("Unique constraint")) {
      return { ok: false, error: `グループ「${name.trim()}」は既に存在します。` };
    }
    return { ok: false, error: `グループの作成に失敗しました（詳細: ${detail}）` };
  }
  revalidatePath("/karte/favorites");
  return { ok: true };
}

export async function deleteFavoriteGroup(groupId: string): Promise<void> {
  // グループを消してもお気に入り自体（Favorite）は消えない
  // （@@relation onDelete: Cascade はFavoriteGroupItem側にのみかかる）。
  await prisma.favoriteGroup.delete({ where: { id: groupId } });
  revalidatePath("/karte/favorites");
}

// 1件のお気に入りが所属するグループを一括で置き換える（チェックボックスの一覧から
// まとめて保存するUIを想定し、個別のadd/remove呼び出しの積み重ねより単純にできる）。
// useActionState + <form>から呼ぶ想定でbind(null, favoriteId)して使うため、
// 第2・第3引数はServer Actionの慣例（prevState, formData）に合わせている。
export async function setFavoriteGroups(
  favoriteId: string,
  _prevState: FavoriteActionResult | null,
  formData: FormData
): Promise<FavoriteActionResult> {
  const groupIds = formData.getAll("groupIds").filter((v): v is string => typeof v === "string");
  try {
    await prisma.$transaction([
      prisma.favoriteGroupItem.deleteMany({ where: { favoriteId } }),
      ...(groupIds.length > 0
        ? [
            prisma.favoriteGroupItem.createMany({
              data: groupIds.map((groupId) => ({ favoriteId, groupId })),
            }),
          ]
        : []),
    ]);
  } catch (e) {
    return {
      ok: false,
      error: `グループ分けの更新に失敗しました（詳細: ${e instanceof Error ? e.message : String(e)}）`,
    };
  }
  revalidatePath("/karte/favorites");
  return { ok: true };
}
