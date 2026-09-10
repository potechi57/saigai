"use server";

import * as XLSX from "xlsx";
import * as officeCrypto from "officecrypto-tool";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  KarteType,
  ProjectCategory,
  RoadType,
  RoadStatus,
  GeodeticSystem,
  Weather,
  ResponseCategory,
  InspectionPeriodType,
  PhotoSourceForm,
} from "@prisma/client";
import type { InspectionTarget } from "@prisma/client";
import {
  extractKarte,
  extractInspectionEvents,
  findFormBSheetNames,
  extractFormBTarget,
  circledNumberToSeq,
} from "@/lib/excel/karte-import";
import { extractFormAImages, extractSheetImages } from "@/lib/excel/karte-image-extract";
import { ROAD_TYPE_LABEL, RESPONSE_META } from "@/lib/labels";

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
// RESPONSE_META（enum→表記）の逆引き。ROAD_TYPE_BY_LABELと同じ理由で完全一致のみ変換する。
const RESPONSE_CATEGORY_BY_LABEL: Record<string, ResponseCategory> = Object.fromEntries(
  Object.entries(RESPONSE_META).map(([value, meta]) => [meta.label, value as ResponseCategory])
);
// 様式の「点検の時期」は"定期"の行のみ対応している（karte-import.tsのコメント参照）。
const INSPECTION_PERIOD_TYPE_BY_LABEL: Record<string, InspectionPeriodType> = {
  "定期": InspectionPeriodType.REGULAR,
  "不定期": InspectionPeriodType.IRREGULAR,
};

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

function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

// Blob上のファイルを取得し、復号・解析してWorkBookにする。
// 取込を複数の段階（Server Action呼び出し）に分けているため（下記コメント参照）、
// 各段階が毎回ファイルを取得し直す必要がある（Server Actionはリクエストごとに
// 独立しており、前の呼び出しでパース済みのWorkBookをメモリ上に持ち越せないため）。
// ファイルサイズが数MB程度であれば、取得・再パース自体は数百ms程度で完了する。
async function loadWorkbookFromBlob(blobUrl: string): Promise<{ wb: XLSX.WorkBook; sourceBuffer: Buffer } | { error: string }> {
  const res = await fetch(blobUrl);
  if (!res.ok) {
    return { error: "アップロード済みファイルの取得に失敗しました。もう一度お試しください。" };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  try {
    const sourceBuffer = officeCrypto.isEncrypted(buffer)
      ? await officeCrypto.decrypt(buffer, { password: KNOWN_TEMPLATE_PASSWORD })
      : buffer;
    const wb = XLSX.read(sourceBuffer, { type: "buffer", cellDates: true });
    return { wb, sourceBuffer };
  } catch {
    return {
      error:
        "Excelファイルを読み込めませんでした。防災カルテ様式（様式Ａ・様式Ｃを含む xls/xlsx）以外のファイル、" +
        "または既知のもの以外のパスワードで保護されている可能性があります。",
    };
  }
}

// ── フェーズ1: 様式Ａ（カルテ基本情報）＋様式Ａの写真 ──────────────────────
//
// 取込作業の進捗を画面に正確に表示するため（「アップロード済み＝100%」表示から
// 実際にカルテが見られるようになるまでの間、何も進捗が分からず時間差があるという
// フィードバックを受けて）、処理全体を複数のServer Action呼び出しに分割している。
// 各フェーズが完了するたびに呼び出し元（ExcelImportForm.tsx）が進捗表示を更新するため、
// 「今何件目の点検対象を処理しているか」等が実際の処理と一致した状態で分かる。
export type ImportPhase1Result =
  | { ok: true; karteId: string; facilityNo: string; formBSheetNames: string[] }
  | { ok: false; error: string };

export async function importPhase1KarteAndFormA(blobUrl: string, fileName: string): Promise<ImportPhase1Result> {
  const loaded = await loadWorkbookFromBlob(blobUrl);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { wb, sourceBuffer } = loaded;

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
    specialistInspectionRequired: extracted.specialistInspectionRequired,
    keyDeformationSummary: extracted.keyDeformationSummary,
    inspectionContentSummary: extracted.inspectionContentSummary,
    specialistComment: extracted.specialistComment,
    responseCategory: extracted.responseCategoryLabel
      ? RESPONSE_CATEGORY_BY_LABEL[extracted.responseCategoryLabel] ?? ResponseCategory.UNEVALUATED
      : ResponseCategory.UNEVALUATED,
    responseEvaluatedAt: extracted.responseEvaluatedAt,
    inspectionPeriodType: extracted.inspectionPeriodTypeLabel
      ? INSPECTION_PERIOD_TYPE_BY_LABEL[extracted.inspectionPeriodTypeLabel] ?? null
      : null,
    inspectionIntervalNote: extracted.inspectionIntervalNote,
    assumedDisasterForm: extracted.assumedDisasterForm,
    responseWhenDeformed: extracted.responseWhenDeformed,
    inspectorName: extracted.inspectorName,
    inspectorCompany: extracted.inspectorCompany,
    inspectorTel: extracted.inspectorTel,
    specialistName: extracted.specialistName,
    specialistCompany: extracted.specialistCompany,
    specialistTel: extracted.specialistTel,
    createdOnSiteDate: extracted.createdOnSiteDate,
    createdOnSiteWeather: extracted.createdOnSiteWeatherLabel
      ? WEATHER_BY_LABEL[extracted.createdOnSiteWeatherLabel] ?? null
      : null,
  };

  const karte = await prisma.karte.upsert({
    where: { facilityNo },
    create: { facilityNo, ...commonData },
    update: commonData,
  });

  // 落石・崩壊カルテ固有の詳細（主な災害形態）。karte-actions.tsのupdateKarteと同じ方針で、
  // カルテ区分が落石・崩壊の場合のみ作成・更新する。
  const rockfallDetailData =
    karteType === KarteType.ROCKFALL_COLLAPSE
      ? { mainFormRockfall: extracted.mainForm.rockfall, mainFormCollapse: extracted.mainForm.collapse }
      : null;

  if (rockfallDetailData) {
    await prisma.karteRockfallDetail.upsert({
      where: { karteId: karte.id },
      create: { karteId: karte.id, ...rockfallDetailData },
      update: rockfallDetailData,
    });
  } else {
    await prisma.karteRockfallDetail.deleteMany({ where: { karteId: karte.id } });
  }

  // 様式Ａの「点検地点位置図・現況写真」欄に埋め込まれた画像を自動で取り込む（ベストエフォート）。
  // 対象は様式Ａシートに埋め込まれたJPEG/PNG等のラスター画像のみ。EMF等のベクター画像、
  // 「R7現状記録写真」等ほかのシートの画像は対象外にしている
  // （理由はlib/excel/karte-image-extract.tsのコメント参照）。
  if (hasBlobCredentials()) {
    const formAImages = extractFormAImages(sourceBuffer);
    if (formAImages.length > 0) {
      try {
        // 再取込のたびに写真が重複して増えないよう、前回のExcel由来の様式Ａ写真
        // （sourceForm=FORM_A）は入れ替える。手動アップロード分（sourceForm=OTHER）は
        // 対象外なので消えない。
        await prisma.photo.deleteMany({
          where: {
            karteId: karte.id,
            targetId: null,
            eventId: null,
            disasterEventId: null,
            sourceForm: PhotoSourceForm.FORM_A,
          },
        });
        for (const [i, img] of formAImages.entries()) {
          const blob = await put(`karte-imports/${facilityNo}-formA-${Date.now()}-${i}.${img.ext}`, img.data, {
            access: "public",
            contentType: `image/${img.ext}`,
          });
          await prisma.photo.create({
            data: { karteId: karte.id, url: blob.url, sourceForm: PhotoSourceForm.FORM_A },
          });
        }
      } catch {
        // 写真取込はベストエフォート。失敗してもインポート結果には影響させない。
      }
    }
  }

  // 取込元のExcelそのものをカルテ資料として保存しておく（抽出結果の検証・原本保全用、
  // ベストエフォート）。ブラウザから直接Blobへアップロード済みのURLをそのまま
  // 資料として記録するだけでよく、サーバー側から再度アップロードし直す必要はない。
  try {
    await prisma.attachmentDocument.create({
      data: { karteId: karte.id, title: `取込元Excel（${fileName}）`, url: blobUrl, fileType: "xls" },
    });
  } catch {
    // 原本保存はベストエフォート。失敗してもインポート結果には影響させない。
  }

  return { ok: true, karteId: karte.id, facilityNo, formBSheetNames: findFormBSheetNames(wb) };
}

// ── フェーズ2: 様式Ｂ1シート分（変状/点検対象1件） ────────────────────────
// シートごとに呼び出す（点検対象1件ずつ進捗を進められるようにするため）。
export type ImportPhase2Result = { ok: true } | { ok: false; error: string };

export async function importPhase2FormBTarget(
  karteId: string,
  blobUrl: string,
  sheetName: string
): Promise<ImportPhase2Result> {
  const loaded = await loadWorkbookFromBlob(blobUrl);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { wb, sourceBuffer } = loaded;

  const fb = extractFormBTarget(wb, sheetName);
  if (!fb) return { ok: true }; // シートが無い等、想定外のケースはスキップ（他フェーズには影響させない）

  // このシートが様式Ｂ全体の何番目かは呼び出し元では分からないため、丸数字が
  // 読み取れなかった場合のフォールバック番号は1にしておく（他のシートと衝突した場合は
  // upsertのwhereで同一レコードとして扱われるだけなので実害は無い）。
  const seq = circledNumberToSeq(fb.sequenceLabel) ?? 1;
  const target = await prisma.inspectionTarget.upsert({
    where: { karteId_sequenceNo: { karteId, sequenceNo: seq } },
    create: {
      karteId,
      sequenceNo: seq,
      name: `点検対象${seq}（Excel取込・要確認）`,
      displayOrder: seq - 1,
      keyPoints: fb.keyPoints,
      checkItems: fb.checkItems,
      createdOnSiteDate: fb.createdOnSiteDate,
      createdOnSiteWeather: fb.createdOnSiteWeatherLabel ? WEATHER_BY_LABEL[fb.createdOnSiteWeatherLabel] ?? null : null,
    },
    update: {
      // 名称はEdit画面で手動修正されている可能性があるため上書きしない。
      keyPoints: fb.keyPoints,
      checkItems: fb.checkItems,
      createdOnSiteDate: fb.createdOnSiteDate,
      createdOnSiteWeather: fb.createdOnSiteWeatherLabel ? WEATHER_BY_LABEL[fb.createdOnSiteWeatherLabel] ?? null : null,
    },
  });

  // 様式Ｂの写真（<詳細スケッチ欄>2枚＋<写真張付欄>1枚、計3枚という配置を実データで
  // 確認済み。karte-image-extract.tsのアンカー座標ソートで自然にこの順になる）。
  if (hasBlobCredentials()) {
    const formBImages = extractSheetImages(sourceBuffer, sheetName);
    if (formBImages.length > 0) {
      try {
        await prisma.photo.deleteMany({ where: { targetId: target.id, sourceForm: PhotoSourceForm.FORM_B } });
        for (const [j, img] of formBImages.entries()) {
          const blob = await put(`karte-imports/${karteId}-formB-${seq}-${Date.now()}-${j}.${img.ext}`, img.data, {
            access: "public",
            contentType: `image/${img.ext}`,
          });
          await prisma.photo.create({
            data: { karteId, targetId: target.id, url: blob.url, sourceForm: PhotoSourceForm.FORM_B },
          });
        }
      } catch {
        // 写真取込はベストエフォート。失敗してもインポート結果には影響させない。
      }
    }
  }

  return { ok: true };
}

// ── フェーズ3（最終）: 様式Ｃ（点検履歴） ──────────────────────────────
// 取込作業の最後のフェーズ。ここが完了した時点で初めてカルテが完全に見られる状態に
// なるため、revalidatePathもここで行う（進捗100%＝実際に見られる、を一致させるため）。
export type ImportPhase3Result =
  | { ok: true; eventsImported: number }
  | { ok: false; error: string };

export async function importPhase3Events(
  karteId: string,
  facilityNo: string,
  blobUrl: string
): Promise<ImportPhase3Result> {
  const loaded = await loadWorkbookFromBlob(blobUrl);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { wb } = loaded;

  // 様式Ｃには、対応する様式Ｂのシートが無くなった変状（過去に追跡していたが
  // 現在は様式Ｂページ自体が削除されている等）の履歴が残っていることを実データで
  // 確認したため、フェーズ2で様式Ｂから作成済みの点検対象に無いsequenceNoが
  // 様式Ｃに出てきた場合も、履歴を取りこぼさないようプレースホルダを追加作成する。
  const targetsBySeq = new Map<number, InspectionTarget>();
  async function getOrCreateTarget(seq: number): Promise<InspectionTarget> {
    const existing = targetsBySeq.get(seq);
    if (existing) return existing;
    const target = await prisma.inspectionTarget.upsert({
      where: { karteId_sequenceNo: { karteId, sequenceNo: seq } },
      create: { karteId, sequenceNo: seq, name: `点検対象${seq}（Excel取込・要確認）`, displayOrder: seq - 1 },
      update: {},
    });
    targetsBySeq.set(seq, target);
    return target;
  }

  const events = extractInspectionEvents(wb);
  let imported = 0;
  for (const ev of events) {
    const event = await prisma.inspectionEvent.upsert({
      where: { karteId_inspectionDate: { karteId, inspectionDate: ev.inspectionDate } },
      create: {
        karteId,
        inspectionDate: ev.inspectionDate,
        inspectorName: ev.inspectorName,
        weather: ev.weatherLabel ? WEATHER_BY_LABEL[ev.weatherLabel] ?? null : null,
        specialistInspectionDate: ev.specialistInspectionDate,
        specialistName: ev.specialistName,
        specialTopics: ev.specialTopics,
        specialistJudgement: ev.specialistJudgementLabel
          ? RESPONSE_CATEGORY_BY_LABEL[ev.specialistJudgementLabel] ?? null
          : null,
        nextInspectionDueYear: ev.nextInspectionDueYear,
      },
      update: {
        inspectorName: ev.inspectorName,
        weather: ev.weatherLabel ? WEATHER_BY_LABEL[ev.weatherLabel] ?? null : null,
        specialistInspectionDate: ev.specialistInspectionDate,
        specialistName: ev.specialistName,
        specialTopics: ev.specialTopics,
        specialistJudgement: ev.specialistJudgementLabel
          ? RESPONSE_CATEGORY_BY_LABEL[ev.specialistJudgementLabel] ?? null
          : null,
        nextInspectionDueYear: ev.nextInspectionDueYear,
      },
    });

    // targetResultsが空（様式Ｃの変状No.マーカーがどの枠にも無い＝実データ非対応の
    // レイアウト）の場合でも、少なくとも1件は点検記録を残せるよう、sequenceNo=1に
    // 結果無しで登録する。
    const results =
      ev.targetResults.length > 0
        ? ev.targetResults
        : [{ sequenceNo: 1, comment: null, diffFromPrevious: false, disasterHistory: false, repairHistory: false }];
    for (const r of results) {
      const target = await getOrCreateTarget(r.sequenceNo);
      await prisma.inspectionResult.upsert({
        where: { eventId_targetId: { eventId: event.id, targetId: target.id } },
        create: {
          eventId: event.id,
          targetId: target.id,
          comment: r.comment,
          diffFromPrevious: r.diffFromPrevious,
          disasterHistory: r.disasterHistory,
          repairHistory: r.repairHistory,
        },
        update: {
          comment: r.comment,
          diffFromPrevious: r.diffFromPrevious,
          disasterHistory: r.disasterHistory,
          repairHistory: r.repairHistory,
        },
      });
    }
    imported++;
  }

  await logAudit({
    action: "UPDATE",
    entityType: "Excel取込",
    summary: `${facilityNo} にExcelから点検記録 ${imported} 件を取込`,
    karteFacilityNo: facilityNo,
  });

  revalidatePath(`/karte/${facilityNo}`);
  revalidatePath("/karte");

  return { ok: true, eventsImported: imported };
}

// ── 旧・一括版（ローカル開発などVercel Blob未設定の環境向けフォールバック） ─────────
//
// 上記フェーズ分割版はいずれもBlob上のファイルを前提にしている（各フェーズが
// blobUrlから再取得するため）。ブラウザからのBlobへの直接アップロードができない
// 環境（Blob未設定のローカル開発等）向けに、ファイル本体を直接1回のServer Action
// 呼び出しで処理する経路を残しておく。この経路では進捗表示は簡易的な
// スピナーのみになる（ExcelImportForm.tsx参照）。
export type ImportKarteResult =
  | { ok: true; facilityNo: string; eventsImported: number }
  | { ok: false; error: string };

export async function importKarteExcel(
  _prevState: ImportKarteResult | null,
  formData: FormData
): Promise<ImportKarteResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ファイルが選択されていません。" };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;

  let wb: XLSX.WorkBook;
  let sourceBuffer: Buffer;
  try {
    sourceBuffer = officeCrypto.isEncrypted(buffer)
      ? await officeCrypto.decrypt(buffer, { password: KNOWN_TEMPLATE_PASSWORD })
      : buffer;
    wb = XLSX.read(sourceBuffer, { type: "buffer", cellDates: true });
  } catch {
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
    specialistInspectionRequired: extracted.specialistInspectionRequired,
    keyDeformationSummary: extracted.keyDeformationSummary,
    inspectionContentSummary: extracted.inspectionContentSummary,
    specialistComment: extracted.specialistComment,
    responseCategory: extracted.responseCategoryLabel
      ? RESPONSE_CATEGORY_BY_LABEL[extracted.responseCategoryLabel] ?? ResponseCategory.UNEVALUATED
      : ResponseCategory.UNEVALUATED,
    responseEvaluatedAt: extracted.responseEvaluatedAt,
    inspectionPeriodType: extracted.inspectionPeriodTypeLabel
      ? INSPECTION_PERIOD_TYPE_BY_LABEL[extracted.inspectionPeriodTypeLabel] ?? null
      : null,
    inspectionIntervalNote: extracted.inspectionIntervalNote,
    assumedDisasterForm: extracted.assumedDisasterForm,
    responseWhenDeformed: extracted.responseWhenDeformed,
    inspectorName: extracted.inspectorName,
    inspectorCompany: extracted.inspectorCompany,
    inspectorTel: extracted.inspectorTel,
    specialistName: extracted.specialistName,
    specialistCompany: extracted.specialistCompany,
    specialistTel: extracted.specialistTel,
    createdOnSiteDate: extracted.createdOnSiteDate,
    createdOnSiteWeather: extracted.createdOnSiteWeatherLabel
      ? WEATHER_BY_LABEL[extracted.createdOnSiteWeatherLabel] ?? null
      : null,
  };

  const karte = await prisma.karte.upsert({
    where: { facilityNo },
    create: { facilityNo, ...commonData },
    update: commonData,
  });

  const rockfallDetailData =
    karteType === KarteType.ROCKFALL_COLLAPSE
      ? { mainFormRockfall: extracted.mainForm.rockfall, mainFormCollapse: extracted.mainForm.collapse }
      : null;

  if (rockfallDetailData) {
    await prisma.karteRockfallDetail.upsert({
      where: { karteId: karte.id },
      create: { karteId: karte.id, ...rockfallDetailData },
      update: rockfallDetailData,
    });
  } else {
    await prisma.karteRockfallDetail.deleteMany({ where: { karteId: karte.id } });
  }

  if (hasBlobCredentials()) {
    const formAImages = extractFormAImages(sourceBuffer);
    if (formAImages.length > 0) {
      try {
        await prisma.photo.deleteMany({
          where: { karteId: karte.id, targetId: null, eventId: null, disasterEventId: null, sourceForm: PhotoSourceForm.FORM_A },
        });
        for (const [i, img] of formAImages.entries()) {
          const blob = await put(`karte-imports/${facilityNo}-formA-${Date.now()}-${i}.${img.ext}`, img.data, {
            access: "public",
            contentType: `image/${img.ext}`,
          });
          await prisma.photo.create({ data: { karteId: karte.id, url: blob.url, sourceForm: PhotoSourceForm.FORM_A } });
        }
      } catch {
        // ベストエフォート
      }
    }
  }

  const targetsBySeq = new Map<number, InspectionTarget>();
  const formBSheetNames = findFormBSheetNames(wb);
  for (const [i, sheetName] of formBSheetNames.entries()) {
    const fb = extractFormBTarget(wb, sheetName);
    if (!fb) continue;
    const seq = circledNumberToSeq(fb.sequenceLabel) ?? i + 1;
    const target = await prisma.inspectionTarget.upsert({
      where: { karteId_sequenceNo: { karteId: karte.id, sequenceNo: seq } },
      create: {
        karteId: karte.id,
        sequenceNo: seq,
        name: `点検対象${seq}（Excel取込・要確認）`,
        displayOrder: seq - 1,
        keyPoints: fb.keyPoints,
        checkItems: fb.checkItems,
        createdOnSiteDate: fb.createdOnSiteDate,
        createdOnSiteWeather: fb.createdOnSiteWeatherLabel ? WEATHER_BY_LABEL[fb.createdOnSiteWeatherLabel] ?? null : null,
      },
      update: {
        keyPoints: fb.keyPoints,
        checkItems: fb.checkItems,
        createdOnSiteDate: fb.createdOnSiteDate,
        createdOnSiteWeather: fb.createdOnSiteWeatherLabel ? WEATHER_BY_LABEL[fb.createdOnSiteWeatherLabel] ?? null : null,
      },
    });
    targetsBySeq.set(seq, target);

    if (hasBlobCredentials()) {
      const formBImages = extractSheetImages(sourceBuffer, sheetName);
      if (formBImages.length > 0) {
        try {
          await prisma.photo.deleteMany({ where: { targetId: target.id, sourceForm: PhotoSourceForm.FORM_B } });
          for (const [j, img] of formBImages.entries()) {
            const blob = await put(`karte-imports/${facilityNo}-formB-${seq}-${Date.now()}-${j}.${img.ext}`, img.data, {
              access: "public",
              contentType: `image/${img.ext}`,
            });
            await prisma.photo.create({
              data: { karteId: karte.id, targetId: target.id, url: blob.url, sourceForm: PhotoSourceForm.FORM_B },
            });
          }
        } catch {
          // ベストエフォート
        }
      }
    }
  }

  async function getOrCreateTarget(seq: number): Promise<InspectionTarget> {
    const existing = targetsBySeq.get(seq);
    if (existing) return existing;
    const target = await prisma.inspectionTarget.upsert({
      where: { karteId_sequenceNo: { karteId: karte.id, sequenceNo: seq } },
      create: { karteId: karte.id, sequenceNo: seq, name: `点検対象${seq}（Excel取込・要確認）`, displayOrder: seq - 1 },
      update: {},
    });
    targetsBySeq.set(seq, target);
    return target;
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
        specialTopics: ev.specialTopics,
        specialistJudgement: ev.specialistJudgementLabel
          ? RESPONSE_CATEGORY_BY_LABEL[ev.specialistJudgementLabel] ?? null
          : null,
        nextInspectionDueYear: ev.nextInspectionDueYear,
      },
      update: {
        inspectorName: ev.inspectorName,
        weather: ev.weatherLabel ? WEATHER_BY_LABEL[ev.weatherLabel] ?? null : null,
        specialistInspectionDate: ev.specialistInspectionDate,
        specialistName: ev.specialistName,
        specialTopics: ev.specialTopics,
        specialistJudgement: ev.specialistJudgementLabel
          ? RESPONSE_CATEGORY_BY_LABEL[ev.specialistJudgementLabel] ?? null
          : null,
        nextInspectionDueYear: ev.nextInspectionDueYear,
      },
    });

    const results =
      ev.targetResults.length > 0
        ? ev.targetResults
        : [{ sequenceNo: 1, comment: null, diffFromPrevious: false, disasterHistory: false, repairHistory: false }];
    for (const r of results) {
      const target = await getOrCreateTarget(r.sequenceNo);
      await prisma.inspectionResult.upsert({
        where: { eventId_targetId: { eventId: event.id, targetId: target.id } },
        create: {
          eventId: event.id,
          targetId: target.id,
          comment: r.comment,
          diffFromPrevious: r.diffFromPrevious,
          disasterHistory: r.disasterHistory,
          repairHistory: r.repairHistory,
        },
        update: {
          comment: r.comment,
          diffFromPrevious: r.diffFromPrevious,
          disasterHistory: r.disasterHistory,
          repairHistory: r.repairHistory,
        },
      });
    }
    imported++;
  }

  if (hasBlobCredentials()) {
    try {
      const blob = await put(`karte-imports/${facilityNo}-${Date.now()}.xls`, buffer, {
        access: "public",
        addRandomSuffix: false,
      });
      await prisma.attachmentDocument.create({
        data: { karteId: karte.id, title: `取込元Excel（${fileName}）`, url: blob.url, fileType: "xls" },
      });
    } catch {
      // ベストエフォート
    }
  }

  await logAudit({
    action: "UPDATE",
    entityType: "Excel取込",
    summary: `${facilityNo} にExcel（${fileName}）を取込（点検記録 ${imported} 件）`,
    karteFacilityNo: facilityNo,
  });

  revalidatePath(`/karte/${facilityNo}`);
  revalidatePath("/karte");

  return { ok: true, facilityNo, eventsImported: imported };
}
