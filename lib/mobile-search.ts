// 現場向け画面（/m）の横断検索。
//
// 【背景・会話ログより】/mは当初カルテ（防災カルテ）専用だったが、
// 「検索結果の一覧画面に法令台帳・施設台帳・点検調書のいずれの情報についても
// 取得できるようにしておいてください」との要望を受け、4つのテーブル
// （Karte・FacilityLedger・FacilityListItem・GateSignInspection）を横断して
// 検索できるようにした。
//
// いずれも「路線名・所在地・緯度経度」という共通の形でデータを持っているため
// （PC側の検索画面 app/karte/page.tsx と同じ分類体系）、同じOR検索・距離計算の
// 考え方をそのまま4テーブルぶん並べている。データ件数はいずれも小規模
// （確認時点でKarte 127件・FacilityListItem 82件・FacilityLedger 5件・
// GateSignInspection 1件）のため、PostGIS等の専用の仕組みは導入せず、
// 全件取得してサーバー側でHaversine距離計算する方式にしている
// （詳細はapp/m/page.tsxの元コメント・会話ログ参照）。

import { prisma } from "@/lib/prisma";
import { haversineDistanceMeters } from "@/lib/geo";
import { KARTE_TYPE_LABEL, FACILITY_LEDGER_DOC_CLASS_LABEL, facilityLedgerDisplayName } from "@/lib/labels";

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
};

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
      select: { facilityNo: true, karteType: true, routeName: true, locationDistrict: true, locationTown: true },
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
      select: { id: true, docClass: true, managementNo: true, name: true, routeName: true, location: true },
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
      select: { id: true, managementNo: true, facilityName: true, routeName: true, location: true },
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
      select: { id: true, managementNo: true, routeName: true, location: true },
    }),
  ]);

  return [
    ...kartes.map(
      (k): MobileSearchResult => ({
        kind: "karte",
        key: `karte-${k.facilityNo}`,
        title: k.facilityNo,
        subtitle: `${KARTE_TYPE_LABEL[k.karteType] ?? k.karteType} ・ ${k.routeName}`,
        location: [k.locationDistrict, k.locationTown].filter(Boolean).join(" ") || null,
        href: `/m/${k.facilityNo}`,
      })
    ),
    ...ledgers.map(
      (l): MobileSearchResult => ({
        kind: "ledger",
        key: `ledger-${l.id}`,
        title: facilityLedgerDisplayName(l.managementNo, l.name),
        subtitle: `${FACILITY_LEDGER_DOC_CLASS_LABEL[l.docClass] ?? l.docClass}${l.routeName ? ` ・ ${l.routeName}` : ""}`,
        location: l.location,
        href: `/ledgers/${l.id}`,
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
      })
    ),
  ];
}

export async function searchMobileNearby(lat: number, lng: number, radiusM: number): Promise<MobileSearchResult[]> {
  const [kartes, ledgers, facilities, gateSigns] = await Promise.all([
    prisma.karte.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: {
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

  const results: MobileSearchResult[] = [
    ...kartes.map((k) => ({
      kind: "karte" as const,
      key: `karte-${k.facilityNo}`,
      title: k.facilityNo,
      subtitle: `${KARTE_TYPE_LABEL[k.karteType] ?? k.karteType} ・ ${k.routeName}`,
      location: [k.locationDistrict, k.locationTown].filter(Boolean).join(" ") || null,
      href: `/m/${k.facilityNo}`,
      distanceM: haversineDistanceMeters(lat, lng, Number(k.latitude), Number(k.longitude)),
    })),
    ...ledgers.map((l) => ({
      kind: "ledger" as const,
      key: `ledger-${l.id}`,
      title: facilityLedgerDisplayName(l.managementNo, l.name),
      subtitle: `${FACILITY_LEDGER_DOC_CLASS_LABEL[l.docClass] ?? l.docClass}${l.routeName ? ` ・ ${l.routeName}` : ""}`,
      location: l.location,
      href: `/ledgers/${l.id}`,
      distanceM: haversineDistanceMeters(lat, lng, Number(l.latitude), Number(l.longitude)),
    })),
    ...facilities.map((f) => ({
      kind: "facility" as const,
      key: `facility-${f.id}`,
      title: f.facilityName || f.managementNo,
      subtitle: f.routeName ?? "",
      location: f.location,
      href: `/facility-list/${f.id}`,
      distanceM: haversineDistanceMeters(lat, lng, Number(f.latitude), Number(f.longitude)),
    })),
    ...gateSigns.map((g) => ({
      kind: "gateSign" as const,
      key: `gateSign-${g.id}`,
      title: g.managementNo || "（管理番号未設定）",
      subtitle: g.routeName ?? "",
      location: g.location,
      href: `/inspections/gate-signs/${g.id}`,
      distanceM: haversineDistanceMeters(lat, lng, Number(g.latitude), Number(g.longitude)),
    })),
  ];

  return results.filter((r) => r.distanceM! <= radiusM).sort((a, b) => a.distanceM! - b.distanceM!);
}
