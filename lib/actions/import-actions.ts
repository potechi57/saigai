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
  findRecordPhotoSheetNames,
  extractRecordPhotoCaptions,
  extractFormBTarget,
  circledNumberToSeq,
} from "@/lib/excel/karte-import";
import { extractFormAImages, extractSheetImages } from "@/lib/excel/karte-image-extract";
import type { ExtractedImage } from "@/lib/excel/karte-image-extract";
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

// 「現状記録写真」シート（様式Ａ・様式Ｂに収まらなかった写真をまとめる別シート。
// findRecordPhotoSheetNamesのコメント参照）に埋め込まれた画像を取り込む。
// 様式Ａの写真取込と同じ「先頭からの画像を全部取り込む」方式だが、キャプション
// （各写真の下にあるコメント欄のセル）は取り込んでいない。様式Ｂのような構造化された
// テキスト項目が無く、キャプションのセル位置が写真の枚数によって変わる（実データで
// 1シート内に最大4枚＝2列×2行の配置を確認）ため、位置から機械的に対応付けるのが
// 様式Ｂほど単純ではなく、今回は画像の取込のみに範囲を絞った（要改善点）。
// 呼び出し側と同じくBlob未設定環境では何もしない（ベストエフォート）。
// 「現状記録写真」シートの画像は、貼り付け位置（列・行）から左上/右上/左下/右下の
// いずれかに機械的に振り分ける（extractRecordPhotoCaptionsのG23/AY23/G41/AY41と
// 同じ4区画）。しきい値は実データ（左列col6〜7・右列col50〜51、上段row6〜7・
// 下段row24〜25）に余裕を持たせた値。稀に5枚目以降が埋め込まれている実データも
// 確認しているため、4区画に収まらない分はextraとして順序維持のまま末尾に回す
// （キャプションは対応付けられない）。
const RECORD_PHOTO_COL_THRESHOLD = 30;
const RECORD_PHOTO_ROW_THRESHOLD = 15;

function assignRecordPhotoGrid(images: ExtractedImage[]): {
  topLeft?: ExtractedImage;
  topRight?: ExtractedImage;
  bottomLeft?: ExtractedImage;
  bottomRight?: ExtractedImage;
  extra: ExtractedImage[];
} {
  const grid: ReturnType<typeof assignRecordPhotoGrid> = { extra: [] };
  for (const img of images) {
    const isTop = img.fromRow < RECORD_PHOTO_ROW_THRESHOLD;
    const isLeft = img.fromCol < RECORD_PHOTO_COL_THRESHOLD;
    const key = isTop ? (isLeft ? "topLeft" : "topRight") : isLeft ? "bottomLeft" : "bottomRight";
    if (!grid[key]) grid[key] = img;
    else grid.extra.push(img);
  }
  return grid;
}

async function importRecordPhotos(
  wb: XLSX.WorkBook,
  sourceBuffer: Buffer,
  karteId: string,
  facilityNo: string
): Promise<void> {
  if (!hasBlobCredentials()) return;
  const sheetNames = findRecordPhotoSheetNames(wb);
  if (sheetNames.length === 0) return;
  try {
    // 再取込のたびに写真が重複して増えないよう、前回のExcel由来の現状記録写真
    // （sourceForm=GENERAL_RECORD）は入れ替える。
    await prisma.photo.deleteMany({
      where: {
        karteId,
        targetId: null,
        eventId: null,
        disasterEventId: null,
        sourceForm: PhotoSourceForm.GENERAL_RECORD,
      },
    });
    // captionには実際のキャプション文字列（Excel上の「起点側全景」等）を入れる。
    // displayOrderには元シートの通し番号（0始まり）を入れ、カルテ詳細画面側は
    // これで写真をグループ化してシートごとにタブを分けて表示する
    // （どのシート由来かの区別だけが目的で、表示上の並び順としての意味は無い）。
    let photoIndex = 0;
    for (const [sheetIndex, sheetName] of sheetNames.entries()) {
      const images = await extractSheetImages(sourceBuffer, sheetName);
      const captions = extractRecordPhotoCaptions(wb, sheetName);
      const grid = assignRecordPhotoGrid(images);
      const ordered: { img: ExtractedImage; caption: string | null }[] = [
        grid.topLeft && { img: grid.topLeft, caption: captions.topLeft },
        grid.topRight && { img: grid.topRight, caption: captions.topRight },
        grid.bottomLeft && { img: grid.bottomLeft, caption: captions.bottomLeft },
        grid.bottomRight && { img: grid.bottomRight, caption: captions.bottomRight },
        ...grid.extra.map((img) => ({ img, caption: null })),
      ].filter((v): v is { img: ExtractedImage; caption: string | null } => Boolean(v));

      for (const { img, caption } of ordered) {
        const blob = await put(`karte-imports/${facilityNo}-record-${Date.now()}-${photoIndex}.${img.ext}`, img.data, {
          access: "public",
          contentType: `image/${img.ext}`,
        });
        await prisma.photo.create({
          data: {
            karteId,
            url: blob.url,
            sourceForm: PhotoSourceForm.GENERAL_RECORD,
            caption,
            displayOrder: sheetIndex,
          },
        });
        photoIndex++;
      }
    }
  } catch {
    // 写真取込はベストエフォート。失敗してもインポート結果には影響させない。
  }
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
    continuousRainfallMm: extracted.continuousRainfallMm,
    hourlyRainfallMm: extracted.hourlyRainfallMm,
    trafficVolumeWeekday: extracted.trafficVolumeWeekday,
    trafficVolumeHoliday: extracted.trafficVolumeHoliday,
    trafficCensusYear: extracted.trafficCensusYear,
    trafficCensusPointCode: extracted.trafficCensusPointCode,
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
  // 対象は様式ＡシートのJPEG/PNG等のラスター画像、およびEMF/WMF（自前のCloud Run変換
  // サービス経由でPNGに変換できた場合のみ。環境変数未設定時は従来どおり無視される）。
  if (hasBlobCredentials()) {
    const formAImages = await extractFormAImages(sourceBuffer);
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

  // 「現状記録写真」シート（様式Ａ・様式Ｂに収まらなかった写真）も同様に取り込む
  // （詳細はimportRecordPhotosのコメント参照）。
  await importRecordPhotos(wb, sourceBuffer, karte.id, facilityNo);

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
    const formBImages = await extractSheetImages(sourceBuffer, sheetName);
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
    continuousRainfallMm: extracted.continuousRainfallMm,
    hourlyRainfallMm: extracted.hourlyRainfallMm,
    trafficVolumeWeekday: extracted.trafficVolumeWeekday,
    trafficVolumeHoliday: extracted.trafficVolumeHoliday,
    trafficCensusYear: extracted.trafficCensusYear,
    trafficCensusPointCode: extracted.trafficCensusPointCode,
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
    const formAImages = await extractFormAImages(sourceBuffer);
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

  // 「現状記録写真」シート（様式Ａ・様式Ｂに収まらなかった写真）も同様に取り込む
  // （詳細はimportRecordPhotosのコメント参照）。
  await importRecordPhotos(wb, sourceBuffer, karte.id, facilityNo);

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
      const formBImages = await extractSheetImages(sourceBuffer, sheetName);
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
