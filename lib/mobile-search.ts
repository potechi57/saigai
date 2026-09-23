// 現場向け画面（/m）の横断検索。
//
// 【背景・会話ログより】/mは当初カルテ（防災カルテ）専用だったが、
// 「検索結果の一覧画面に法令台帳・施設台帳・点検調書のいずれの情報についても
// 取得できるようにしておいてください」との要望を受け、4つのテーブル
// （Karte・FacilityLedger・FacilityListItem・GateSignInspection）を横断して
// 検索できるようにした。
//
// いずれも「路線名・所在地・緯度経度」という共通の形でデータを持っているため
// （PC側の検索画面 app/map/page.tsx と同じ分類体系）、同じOR検索・距離計算の
// 考え方をそのまま4テーブルぶん並べている。データ件数はいずれも小規模
// （確認時点でKarte 127件・FacilityListItem 82件・FacilityLedger 5件・
// GateSignInspection 1件）のため、PostGIS等の専用の仕組みは導入せず、
// 全件取得してサーバー側でHaversine距離計算する方式にしている
// （詳細はapp/m/page.tsxの元コメント・会話ログ参照）。
//
// 緯度経度も結果に含めているのは、/mのトップ画面に地図を表示する要望
// （会話ログ「地図と現在地が表示されている仕様がイメージ通り」参照）に対応する
// ため、検索結果を地図上にピン表示できるようにするため。

import { prisma } from "@/lib/prisma";
import { haversineDistanceMeters } from "@/lib/geo";
import { KARTE_TYPE_LABEL, FACILITY_LEDGER_DOC_CLASS_LABEL, facilityLedgerDisplayName } from "@/lib/labels";
import { getStartEndRecordPhotos, getFormAThumbnails } from "@/lib/map-photos";

// 「現在地から探す」の対象範囲は、既定値も含めてlib/mobile-prefs.tsに集約している
// （会話ログ「現在地検索の半径変更」により、設定画面で変更できるようにしたため）。

export type MobileResultKind = "karte" | "ledger" | "facility" | "gateSign";

export const MOBILE_RESULT_KIND_LABEL: Record<MobileResultKind, string> = {
  karte: "防災カルテ",
  ledger: "台帳（画像）",
  facility: "施設台帳",
  gateSign: "点検調書",
};

export type MobileSearchResult = {
  kind: MobileResultKind;
  key: string; // React key（kind+idで一意）
  title: string; // 主表示（施設管理番号・管理番号・台帳名等）
  subtitle: string; // 種別ラベル・路線名
  location: string | null;
  // 詳細画面へのリンク。カルテのみ現場向けの専用画面（/m/[facilityNo]。写真閲覧・
  // 簡易点検記録に対応）があるが、法令台帳・施設台帳・点検調書はまだ現場向けの
  // 画面が無く、PC向けの既存詳細画面（/ledgers/[id]等）にそのままリンクしている
  // （既知の制限。スマホ幅での見やすさは保証されない。将来的に必要性が高ければ
  // カルテと同様の現場向け画面を追加する）。
  href: string;
  distanceM?: number; // 現在地検索時のみ設定
  latitude: number | null; // 地図表示用（無い場合はピンを打てない）
  longitude: number | null;
  // 地図ピンのタップ時に表示する参考写真（起点／終点／様式Ａの点検地点位置図）。
  // 今のところkind==="karte"の結果にのみ設定される（PC版地図と同じデータ・
  // 同じ考え方。lib/map-photos.ts参照）。formAPhotoUrlは、起点・終点だけでは
  // 「どういう箇所か」が分かりにくいという指摘を受けて追加した
  // （会話ログ「起点終点のみでは、どういう箇所なのかわからない」参照）。
  startPhotoUrl?: string;
  endPhotoUrl?: string;
  formAPhotoUrl?: string;
};

// kartes配列（karte.findMany結果）に、起点／終点／様式Ａの参考写真URLを付与した
// MobileSearchResultの配列を作る。searchMobileByText・searchMobileNearby共通の
// 末尾処理としてまとめている（PC版地図のapp/map/page.tsxと同じ
// getStartEndRecordPhotos・getFormAThumbnailsを再利用。会話ログ「スマホでも、
// ポイントをタップした際に関連する画像を表示してください」参照）。
async function attachStartEndPhotos<T extends MobileSearchResult>(
  kartes: T[],
  karteIds: string[]
): Promise<T[]> {
  if (karteIds.length === 0) return kartes;
  const [photosByKarteId, formAByKarteId] = await Promise.all([
    getStartEndRecordPhotos(karteIds),
    getFormAThumbnails(karteIds),
  ]);
  return kartes.map((k, i) => {
    const photos = photosByKarteId.get(karteIds[i]);
    const formAPhotoUrl = formAByKarteId.get(karteIds[i]);
    return { ...k, startPhotoUrl: photos?.startPhotoUrl, endPhotoUrl: photos?.endPhotoUrl, formAPhotoUrl };
  });
}

// 1テーブルあたりのテキスト検索件数の上限（DBへの問い合わせ自体を軽く保つため）。
// 最終的な表示件数の上限は呼び出し側（app/m/page.tsx）で別途まとめて絞る。
const PER_KIND_TEXT_TAKE = 20;

export async function searchMobileByText(q: string): Promise<MobileSearchResult[]> {
  const [kartes, ledgers, facilities, gateSigns] = await Promise.all([
    prisma.karte.findMany({
      where: {
        OR: [
          { facilityNo: { contains: q, mode: "insensitive" } },
          { routeName: { contains: q, mode: "insensitive" } },
          { landmark: { contains: q, mode: "insensitive" } },
          { locationDistrict: { contains: q, mode: "insensitive" } },
          { locationTown: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { facilityNo: "asc" },
      take: PER_KIND_TEXT_TAKE,
      select: {
        id: true,
        facilityNo: true,
        karteType: true,
        routeName: true,
        locationDistrict: true,
        locationTown: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.facilityLedger.findMany({
      where: {
        OR: [
          { managementNo: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { routeName: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
        ],
      },
      take: PER_KIND_TEXT_TAKE,
      select: {
        id: true,
        docClass: true,
        managementNo: true,
        name: true,
        routeName: true,
        location: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.facilityListItem.findMany({
      where: {
        OR: [
          { managementNo: { contains: q, mode: "insensitive" } },
          { facilityName: { contains: q, mode: "insensitive" } },
          { routeName: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
        ],
      },
      take: PER_KIND_TEXT_TAKE,
      select: {
        id: true,
        managementNo: true,
        facilityName: true,
        routeName: true,
        location: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.gateSignInspection.findMany({
      where: {
        OR: [
          { managementNo: { contains: q, mode: "insensitive" } },
          { routeName: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
        ],
      },
      take: PER_KIND_TEXT_TAKE,
      select: { id: true, managementNo: true, routeName: true, location: true, latitude: true, longitude: true },
    }),
  ]);

  const karteResults = await attachStartEndPhotos(
    kartes.map(
      (k): MobileSearchResult => ({
        kind: "karte",
        key: `karte-${k.facilityNo}`,
        title: k.facilityNo,
        subtitle: `${KARTE_TYPE_LABEL[k.karteType] ?? k.karteType} ・ ${k.routeName}`,
        location: [k.locationDistrict, k.locationTown].filter(Boolean).join(" ") || null,
        href: `/m/${k.facilityNo}`,
        latitude: k.latitude != null ? Number(k.latitude) : null,
        longitude: k.longitude != null ? Number(k.longitude) : null,
      })
    ),
    kartes.map((k) => k.id)
  );

  return [
    ...karteResults,
    ...ledgers.map(
      (l): MobileSearchResult => ({
        kind: "ledger",
        key: `ledger-${l.id}`,
        title: facilityLedgerDisplayName(l.managementNo, l.name),
        subtitle: `${FACILITY_LEDGER_DOC_CLASS_LABEL[l.docClass] ?? l.docClass}${l.routeName ? ` ・ ${l.routeName}` : ""}`,
        location: l.location,
        href: `/ledgers/${l.id}`,
        latitude: l.latitude != null ? Number(l.latitude) : null,
        longitude: l.longitude != null ? Number(l.longitude) : null,
      })
    ),
    ...facilities.map(
      (f): MobileSearchResult => ({
        kind: "facility",
        key: `facility-${f.id}`,
        title: f.facilityName || f.managementNo,
        subtitle: f.routeName ?? "",
        location: f.location,
        href: `/facility-list/${f.id}`,
        latitude: f.latitude != null ? Number(f.latitude) : null,
        longitude: f.longitude != null ? Number(f.longitude) : null,
      })
    ),
    ...gateSigns.map(
      (g): MobileSearchResult => ({
        kind: "gateSign",
        key: `gateSign-${g.id}`,
        title: g.managementNo || "（管理番号未設定）",
        subtitle: g.routeName ?? "",
        location: g.location,
        href: `/inspections/gate-signs/${g.id}`,
        latitude: g.latitude != null ? Number(g.latitude) : null,
        longitude: g.longitude != null ? Number(g.longitude) : null,
      })
    ),
  ];
}

export async function searchMobileNearby(lat: number, lng: number, radiusM: number): Promise<MobileSearchResult[]> {
  const [kartes, ledgers, facilities, gateSigns] = await Promise.all([
    prisma.karte.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: {
        id: true,
        facilityNo: true,
        karteType: true,
        routeName: true,
        locationDistrict: true,
        locationTown: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.facilityLedger.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: {
        id: true,
        docClass: true,
        managementNo: true,
        name: true,
        routeName: true,
        location: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.facilityListItem.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: {
        id: true,
        managementNo: true,
        facilityName: true,
        routeName: true,
        location: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.gateSignInspection.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: { id: true, managementNo: true, routeName: true, location: true, latitude: true, longitude: true },
    }),
  ]);

  const karteResults = await attachStartEndPhotos(
    kartes.map((k) => ({
      kind: "karte" as const,
      key: `karte-${k.facilityNo}`,
      title: k.facilityNo,
      subtitle: `${KARTE_TYPE_LABEL[k.karteType] ?? k.karteType} ・ ${k.routeName}`,
      location: [k.locationDistrict, k.locationTown].filter(Boolean).join(" ") || null,
      href: `/m/${k.facilityNo}`,
      latitude: Number(k.latitude),
      longitude: Number(k.longitude),
      distanceM: haversineDistanceMeters(lat, lng, Number(k.latitude), Number(k.longitude)),
    })),
    kartes.map((k) => k.id)
  );

  const results: MobileSearchResult[] = [
    ...karteResults,
    ...ledgers.map((l) => ({
      kind: "ledger" as const,
      key: `ledger-${l.id}`,
      title: facilityLedgerDisplayName(l.managementNo, l.name),
      subtitle: `${FACILITY_LEDGER_DOC_CLASS_LABEL[l.docClass] ?? l.docClass}${l.routeName ? ` ・ ${l.routeName}` : ""}`,
      location: l.location,
      href: `/ledgers/${l.id}`,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
      distanceM: haversineDistanceMeters(lat, lng, Number(l.latitude), Number(l.longitude)),
    })),
    ...facilities.map((f) => ({
      kind: "facility" as const,
      key: `facility-${f.id}`,
      title: f.facilityName || f.managementNo,
      subtitle: f.routeName ?? "",
      location: f.location,
      href: `/facility-list/${f.id}`,
      latitude: Number(f.latitude),
      longitude: Number(f.longitude),
      distanceM: haversineDistanceMeters(lat, lng, Number(f.latitude), Number(f.longitude)),
    })),
    ...gateSigns.map((g) => ({
      kind: "gateSign" as const,
      key: `gateSign-${g.id}`,
      title: g.managementNo || "（管理番号未設定）",
      subtitle: g.routeName ?? "",
      location: g.location,
      href: `/inspections/gate-signs/${g.id}`,
      latitude: Number(g.latitude),
      longitude: Number(g.longitude),
      distanceM: haversineDistanceMeters(lat, lng, Number(g.latitude), Number(g.longitude)),
    })),
  ];

  return results.filter((r) => r.distanceM! <= radiusM).sort((a, b) => a.distanceM! - b.distanceM!);
}
