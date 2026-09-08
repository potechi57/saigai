"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  KarteType,
  ProjectCategory,
  RoadType,
  RoadStatus,
  GeodeticSystem,
  ResponseCategory,
  Weather,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── FormDataから安全に値を取り出す小さなヘルパー群 ──────────────────
// zod等は導入せず、必要最小限の手作業パースにとどめている
// （「アプリを不必要に大きくしない」方針）。

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateVal(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  return v ? new Date(v) : null;
}

function checkbox(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

function enumVal<T extends Record<string, string>>(fd: FormData, key: string, e: T): T[keyof T] | null {
  const v = str(fd, key);
  if (v && Object.prototype.hasOwnProperty.call(e, v)) return v as T[keyof T];
  return null;
}

// ── カルテ本体（指示書12章「編集画面」カルテ基本情報） ──────────────────

function buildKarteData(fd: FormData) {
  return {
    facilityNo: str(fd, "facilityNo") ?? "",
    karteType: enumVal(fd, "karteType", KarteType) ?? KarteType.OTHER,
    routeName: str(fd, "routeName") ?? "",
    routeNo: str(fd, "routeNo"),
    manageOrgName: str(fd, "manageOrgName"),
    manageOrgCode: str(fd, "manageOrgCode"),
    distanceMarkerFromKm: num(fd, "distanceMarkerFromKm"),
    distanceMarkerToKm: num(fd, "distanceMarkerToKm"),
    sideOfRoad: str(fd, "sideOfRoad"),
    extensionLengthM: num(fd, "extensionLengthM"),
    projectCategory: enumVal(fd, "projectCategory", ProjectCategory),
    roadType: enumVal(fd, "roadType", RoadType),
    roadStatus: enumVal(fd, "roadStatus", RoadStatus),
    locationDistrict: str(fd, "locationDistrict"),
    locationTown: str(fd, "locationTown"),
    landmark: str(fd, "landmark"),
    latitude: num(fd, "latitude"),
    longitude: num(fd, "longitude"),
    geodeticSystem: enumVal(fd, "geodeticSystem", GeodeticSystem),
    responseCategory: enumVal(fd, "responseCategory", ResponseCategory) ?? ResponseCategory.UNEVALUATED,
    responseEvaluatedAt: dateVal(fd, "responseEvaluatedAt"),
    keyDeformationSummary: str(fd, "keyDeformationSummary"),
    inspectionContentSummary: str(fd, "inspectionContentSummary"),
    specialistComment: str(fd, "specialistComment"),
  };
}

export async function createKarte(formData: FormData) {
  const data = buildKarteData(formData);
  if (!data.facilityNo) throw new Error("施設管理番号は必須です");
  if (!data.routeName) throw new Error("路線名は必須です");

  const karte = await prisma.karte.create({
    data: {
      ...data,
      rockfallDetail:
        data.karteType === KarteType.ROCKFALL_COLLAPSE
          ? {
              create: {
                mainFormRockfall: checkbox(formData, "mainFormRockfall"),
                mainFormCollapse: checkbox(formData, "mainFormCollapse"),
              },
            }
          : undefined,
    },
  });

  revalidatePath("/karte");
  redirect(`/karte/${karte.facilityNo}`);
}

export async function updateKarte(karteId: string, formData: FormData) {
  const data = buildKarteData(formData);
  if (!data.facilityNo) throw new Error("施設管理番号は必須です");
  if (!data.routeName) throw new Error("路線名は必須です");

  await prisma.$transaction(async (tx) => {
    await tx.karte.update({ where: { id: karteId }, data });

    // 落石・崩壊カルテ固有の詳細テーブル。区分がそれ以外に変わった場合は削除する
    // （1:1の拡張テーブルなので、区分が変わったら古い詳細を残す意味がないため）。
    if (data.karteType === KarteType.ROCKFALL_COLLAPSE) {
      await tx.karteRockfallDetail.upsert({
        where: { karteId },
        create: {
          karteId,
          mainFormRockfall: checkbox(formData, "mainFormRockfall"),
          mainFormCollapse: checkbox(formData, "mainFormCollapse"),
        },
        update: {
          mainFormRockfall: checkbox(formData, "mainFormRockfall"),
          mainFormCollapse: checkbox(formData, "mainFormCollapse"),
        },
      });
    } else {
      await tx.karteRockfallDetail.deleteMany({ where: { karteId } });
    }
  });

  revalidatePath(`/karte/${data.facilityNo}`);
  revalidatePath("/karte");
  redirect(`/karte/${data.facilityNo}`);
}

// カルテ自体の削除。点検対象・点検記録・災害履歴・写真・資料は全てKarteとの
// リレーションにonDelete: Cascadeを設定してあるため、Prisma側で自動的に
// まとめて削除される（Vercel Blob上の実ファイルは削除されず残る。誤って
// 大量アップロードした場合を除き実害は小さいため、現時点では未対応）。
//
// 点検対象の論理削除（isActive）とは異なり、こちらは物理削除にしている。
// 「誤って追加したカルテ」を消す用途のため、中途半端に残しておく方が
// かえって一覧を汚してしまうと判断した。確認ダイアログ（ConfirmSubmitButton）
// で誤操作を防ぐ。
export async function deleteKarte(karteId: string) {
  await prisma.karte.delete({ where: { id: karteId } });

  revalidatePath("/karte");
  redirect("/karte");
}

// ── 点検対象（変状No.相当） ──────────────────────────────────

export async function createInspectionTarget(karteId: string, karteFacilityNo: string, formData: FormData) {
  const name = str(formData, "name");
  if (!name) throw new Error("対象名称は必須です");

  const maxSeq = await prisma.inspectionTarget.aggregate({
    where: { karteId },
    _max: { sequenceNo: true },
  });
  const nextSeq = (maxSeq._max.sequenceNo ?? 0) + 1;

  await prisma.inspectionTarget.create({
    data: {
      karteId,
      sequenceNo: nextSeq,
      name,
      description: str(formData, "description"),
      displayOrder: nextSeq - 1,
    },
  });

  revalidatePath(`/karte/${karteFacilityNo}`);
  redirect(`/karte/${karteFacilityNo}`);
}

export async function updateInspectionTarget(targetId: string, karteFacilityNo: string, formData: FormData) {
  const name = str(formData, "name");
  if (!name) throw new Error("対象名称は必須です");

  await prisma.inspectionTarget.update({
    where: { id: targetId },
    data: {
      name,
      description: str(formData, "description"),
      // 以下は様式Ｂ相当の項目
      keyPoints: str(formData, "keyPoints"),
      checkItems: str(formData, "checkItems"),
      createdOnSiteDate: dateVal(formData, "createdOnSiteDate"),
      createdOnSiteWeather: enumVal(formData, "createdOnSiteWeather", Weather),
    },
  });

  revalidatePath(`/karte/${karteFacilityNo}`);
  redirect(`/karte/${karteFacilityNo}`);
}

// 削除については誤操作防止のため物理削除ではなく論理削除にする（指示書12章の方針）。
// 確認ダイアログはクライアント側（ConfirmSubmitButton）で挟む。
export async function setInspectionTargetActive(targetId: string, karteFacilityNo: string, isActive: boolean) {
  await prisma.inspectionTarget.update({
    where: { id: targetId },
    data: { isActive },
  });

  revalidatePath(`/karte/${karteFacilityNo}`);
  redirect(`/karte/${karteFacilityNo}`);
}

// ── 点検記録（点検イベント＋点検対象ごとの結果をまとめて1回で登録） ────────────

export async function createInspectionEvent(
  karteId: string,
  karteFacilityNo: string,
  targetIds: string[],
  formData: FormData
) {
  const inspectionDate = dateVal(formData, "inspectionDate");
  if (!inspectionDate) throw new Error("点検日は必須です");

  await prisma.inspectionEvent.create({
    data: {
      karteId,
      inspectionDate,
      inspectorName: str(formData, "inspectorName"),
      weather: enumVal(formData, "weather", Weather),
      specialTopics: str(formData, "specialTopics"),
      specialistInspectionDate: dateVal(formData, "specialistInspectionDate"),
      specialistName: str(formData, "specialistName"),
      specialistJudgement: enumVal(formData, "specialistJudgement", ResponseCategory),
      nextInspectionDueYear: num(formData, "nextInspectionDueYear"),
      results: {
        create: targetIds.map((targetId) => ({
          targetId,
          diffFromPrevious: checkbox(formData, `result_${targetId}_diff`),
          disasterHistory: checkbox(formData, `result_${targetId}_disaster`),
          repairHistory: checkbox(formData, `result_${targetId}_repair`),
          comment: str(formData, `result_${targetId}_comment`),
        })),
      },
    },
  });

  revalidatePath(`/karte/${karteFacilityNo}`);
  redirect(`/karte/${karteFacilityNo}`);
}
