"use server";

import * as XLSX from "xlsx";
import * as officeCrypto from "officecrypto-tool";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { KarteType, ProjectCategory, RoadType, RoadStatus, GeodeticSystem, Weather } from "@prisma/client";
import { extractKarte, extractInspectionEvents } from "@/lib/excel/karte-import";
import { ROAD_TYPE_LABEL } from "@/lib/labels";

const KARTE_TYPE_BY_LABEL: Record<string, KarteType> = {
  "落石・崩壊": KarteType.ROCKFALL_COLLAPSE,
  "岩盤崩壊": KarteType.ROCK_MASS_COLLAPSE,
  "地すべり": KarteType.LANDSLIDE,
  "雪崩": KarteType.AVALANCHE,
  "土石流": KarteType.DEBRIS_FLOW,
  "盛土": KarteType.EMBANKMENT,
  "擁壁": KarteType.RETAINING_WALL,
  "橋梁基礎の洗掘": KarteType.BRIDGE_FOUNDATION_SCOUR,
  "地吹雪": KarteType.SNOWDRIFT,
  "その他": KarteType.OTHER,
};
const PROJECT_CATEGORY_BY_LABEL: Record<string, ProjectCategory> = { "一般": ProjectCategory.GENERAL, "有料": ProjectCategory.TOLL };
const ROAD_STATUS_BY_LABEL: Record<string, RoadStatus> = {
  "現道": RoadStatus.CURRENT,
  "旧道": RoadStatus.OLD,
  "新道": RoadStatus.NEW,
  "新新道": RoadStatus.NEWEST,
};
const GEODETIC_BY_LABEL: Record<string, GeodeticSystem> = { "世界測地系": GeodeticSystem.WORLD, "日本測地系": GeodeticSystem.JAPAN };
// ROAD_TYPE_LABEL（enum→表記）の逆引き（表記→enum）。lib/labels.tsに定義済みの表記と
// 完全一致した場合のみ変換し、一致しないものはnullのまま（想定外の表記を誤って
// 別のenum値に丸めてしまわないため）。
const ROAD_TYPE_BY_LABEL: Record<string, RoadType> = Object.fromEntries(
  Object.entries(ROAD_TYPE_LABEL).map(([value, label]) => [label, value as RoadType])
);
const WEATHER_BY_LABEL: Record<string, Weather> = { "晴": Weather.SUNNY, "曇": Weather.CLOUDY, "雨": Weather.RAIN, "雪": Weather.SNOW };

// 防災カルテ様式の一部（全国地質調査業協会連合会版）は、シート保護のために
// "VelvetSweatshop" という固定パスワードで暗号化されている。これはExcelが
// 一部の保護付きテンプレートに一律で使う周知のデフォルト値であり、実質的な
// セキュリティ機能ではない（本物の秘密のパスワードではないため、ここに
// ハードコードしても情報漏洩にはあたらない）。
const KNOWN_TEMPLATE_PASSWORD = "VelvetSweatshop";

// ファイル名等をURLパスセグメントとして安全な文字列に変換する
// （拡張子を除去し、半角英数字・ハイフン・アンダースコア以外の連続を"_"にまとめる）。
function sanitizeForUrl(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "");
  const safe = stem.replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || "FILE";
}

// 取込結果をユーザーに分かりやすく伝えるため、成功時もエラー時も
// redirect()を使わず呼び出し元（クライアントコンポーネント、useActionState）に返す設計にしている。
export type ImportKarteResult =
  | { ok: true; facilityNo: string; eventsImported: number }
  | { ok: false; error: string };

export async function importKarteExcel(
  _prevState: ImportKarteResult | null,
  formData: FormData
): Promise<ImportKarteResult> {
  // 実際の防災カルテExcelは様式Ｂ・Ｃに写真が埋め込まれており数MB～10MB近くになることが多い。
  // Server Actionの本文には既定で1MBの上限があり（next.config.mjsで緩和済み）、さらに本番
  // （Vercel）ではVercel Functions自体のリクエストサイズ上限（next.config側の設定とは無関係に
  // 存在する）があるため、大きいファイルはブラウザから直接Vercel Blobへアップロードし、
  // ここにはそのURLだけを渡す経路をExcelImportForm側で使う（app/api/blob-upload/route.ts参照）。
  // 小さいファイル（ローカル開発でのテスト等、Blob未設定の環境向け）は従来どおり
  // ファイル本体をそのままここに送る経路も残している。
  const blobUrl = formData.get("blobUrl");
  const blobFileName = formData.get("fileName");

  let buffer: Buffer;
  let fileName: string;
  let alreadyUploadedBlobUrl: string | null = null;

  if (typeof blobUrl === "string" && blobUrl) {
    const res = await fetch(blobUrl);
    if (!res.ok) {
      return { ok: false, error: "アップロード済みファイルの取得に失敗しました。もう一度お試しください。" };
    }
    buffer = Buffer.from(await res.arrayBuffer());
    fileName = typeof blobFileName === "string" && blobFileName ? blobFileName : "uploaded.xlsx";
    alreadyUploadedBlobUrl = blobUrl;
  } else {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "ファイルが選択されていません。" };
    }
    buffer = Buffer.from(await file.arrayBuffer());
    fileName = file.name;
  }

  let wb: XLSX.WorkBook;
  try {
    const sourceBuffer = officeCrypto.isEncrypted(buffer)
      ? await officeCrypto.decrypt(buffer, { password: KNOWN_TEMPLATE_PASSWORD })
      : buffer;
    wb = XLSX.read(sourceBuffer, { type: "buffer", cellDates: true });
  } catch (e) {
    return {
      ok: false,
      error:
        "Excelファイルを読み込めませんでした。防災カルテ様式（様式Ａ・様式Ｃを含む xls/xlsx）以外のファイル、" +
        "または既知のもの以外のパスワードで保護されている可能性があります。",
    };
  }

  const extracted = extractKarte(wb);
  if (!extracted) {
    return { ok: false, error: "「様式Ａ」シートが見つかりませんでした。防災カルテの様式ファイルか確認してください。" };
  }

  // 施設管理番号が未入力（今回のテストファイルのように空）の場合は、
  // 後から編集画面で修正できることを前提に、ファイル名から仮の番号を組み立てる。
  // facilityNoはURLのパスセグメント（/karte/[karteNo]）としてそのまま使われるため、
  // 半角英数字・ハイフン・アンダースコアのみに正規化する（空白や日本語を含む値を
  // 実際にVercel本番環境で使ったところ、詳細画面が404になる不具合を実データで確認したため）。
  const facilityNo = extracted.facilityNo || `IMPORT-${sanitizeForUrl(fileName)}-${Date.now()}`;
  const karteType = extracted.karteTypeLabel
    ? KARTE_TYPE_BY_LABEL[extracted.karteTypeLabel] ?? KarteType.OTHER
    : KarteType.OTHER;

  const commonData = {
    karteType,
    manageOrgName: extracted.manageOrgName,
    manageOrgCode: extracted.manageOrgCode,
    ledgerNo: extracted.ledgerNo,
    routeName: extracted.routeName ?? "（取込・路線名未設定）",
    distanceMarkerFromKm: extracted.distanceMarkerFromKm,
    distanceMarkerToKm: extracted.distanceMarkerToKm,
    sideOfRoad: extracted.sideOfRoad,
    extensionLengthM: extracted.extensionLengthM,
    projectCategory: extracted.projectCategoryLabel ? PROJECT_CATEGORY_BY_LABEL[extracted.projectCategoryLabel] ?? null : null,
    roadType: extracted.roadTypeLabel ? ROAD_TYPE_BY_LABEL[extracted.roadTypeLabel] ?? null : null,
    roadStatus: extracted.roadStatusLabel ? ROAD_STATUS_BY_LABEL[extracted.roadStatusLabel] ?? null : null,
    locationDistrict: extracted.locationDistrict,
    locationTown: extracted.locationTown,
    landmark: extracted.landmark,
    latitude: extracted.latitude,
    longitude: extracted.longitude,
    geodeticSystem: extracted.geodeticSystemLabel ? GEODETIC_BY_LABEL[extracted.geodeticSystemLabel] ?? null : null,
    preTrafficRestriction: extracted.preTrafficRestriction,
    trafficVolumeWeekday: extracted.trafficVolumeWeekday,
    trafficVolumeHoliday: extracted.trafficVolumeHoliday,
    didArea: extracted.didArea,
    busRoute: extracted.busRoute,
    detour: extracted.detour,
    emergencyRoadCategory: extracted.emergencyRoadCategory,
  };

  const karte = await prisma.karte.upsert({
    where: { facilityNo },
    create: { facilityNo, ...commonData },
    update: commonData,
  });

  // 様式Ｂに変状（点検対象）の定義が無いファイルが多いため、点検記録の受け皿として
  // 最初の1件だけプレースホルダの点検対象を用意する（複数変状には未対応、上記の通り）。
  let target = await prisma.inspectionTarget.findFirst({
    where: { karteId: karte.id },
    orderBy: { sequenceNo: "asc" },
  });
  if (!target) {
    target = await prisma.inspectionTarget.create({
      data: { karteId: karte.id, sequenceNo: 1, name: "点検対象1（Excel取込・要確認）", displayOrder: 0 },
    });
  }

  const events = extractInspectionEvents(wb);
  let imported = 0;
  for (const ev of events) {
    const event = await prisma.inspectionEvent.upsert({
      where: { karteId_inspectionDate: { karteId: karte.id, inspectionDate: ev.inspectionDate } },
      create: {
        karteId: karte.id,
        inspectionDate: ev.inspectionDate,
        inspectorName: ev.inspectorName,
        weather: ev.weatherLabel ? WEATHER_BY_LABEL[ev.weatherLabel] ?? null : null,
        specialistInspectionDate: ev.specialistInspectionDate,
        specialistName: ev.specialistName,
      },
      update: {
        inspectorName: ev.inspectorName,
        weather: ev.weatherLabel ? WEATHER_BY_LABEL[ev.weatherLabel] ?? null : null,
        specialistInspectionDate: ev.specialistInspectionDate,
        specialistName: ev.specialistName,
      },
    });

    await prisma.inspectionResult.upsert({
      where: { eventId_targetId: { eventId: event.id, targetId: target.id } },
      create: {
        eventId: event.id,
        targetId: target.id,
        diffFromPrevious: ev.diffFromPrevious,
        disasterHistory: ev.disasterHistory,
        repairHistory: ev.repairHistory,
      },
      update: {
        diffFromPrevious: ev.diffFromPrevious,
        disasterHistory: ev.disasterHistory,
        repairHistory: ev.repairHistory,
      },
    });
    imported++;
  }

  // 取込元のExcelそのものをカルテ資料として保存しておく（抽出結果の検証・原本保全用、ベストエフォート）。
  if (alreadyUploadedBlobUrl) {
    // ブラウザから直接Blobへアップロード済み（上記参照）。同じURLをそのまま資料として記録するだけでよく、
    // サーバー側から再度アップロードし直す必要はない。
    try {
      await prisma.attachmentDocument.create({
        data: { karteId: karte.id, title: `取込元Excel（${fileName}）`, url: alreadyUploadedBlobUrl, fileType: "xls" },
      });
    } catch {
      // 原本保存はベストエフォート。失敗してもインポート結果には影響させない。
    }
  } else if (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN) {
    // 従来経路（ファイル本体を直接Server Actionに送った小さいファイル向け）。
    // @vercel/blob は認証情報が無いとすぐ失敗せず長時間待たされることを確認済みのため、
    // 事前に認証情報の有無を確認してから呼び出す（photo-actions.tsのhasBlobCredentials()と同じ理由。
    // BLOB_READ_WRITE_TOKEN固定トークン方式・VERCEL_OIDC_TOKEN方式のどちらかがあればよい）。
    try {
      const blob = await put(`karte-imports/${facilityNo}-${Date.now()}.xls`, buffer, {
        access: "public",
        addRandomSuffix: false,
      });
      await prisma.attachmentDocument.create({
        data: { karteId: karte.id, title: `取込元Excel（${fileName}）`, url: blob.url, fileType: "xls" },
      });
    } catch {
      // 原本保存はベストエフォート。失敗してもインポート結果には影響させない。
    }
  }

  revalidatePath(`/karte/${facilityNo}`);
  revalidatePath("/karte");

  return { ok: true, facilityNo, eventsImported: imported };
}
