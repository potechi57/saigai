// 検索フォームのドロップダウン選択肢（路線名・健全性判定区分など）専用の
// キャッシュ付き取得関数。
//
// 背景（性能監査より）: これらは「実際に登録されている値から選ぶ」ための参照データで、
// Excelインポートや台帳の追加・編集をしない限り中身は変わらない。にもかかわらず
// app/karte/page.tsxでは検索するたびに（＝ページを開くたびに）DISTINCT検索を4本
// 実行しており、無駄なDB往復になっていた。
//
// unstable_cacheでラップし、短い期間（30秒）だけ結果を使い回すことで、この4本分の
// 往復をほぼ無くす。30秒はこの手のマスタ値がその場で頻繁に変わらないMVP用途では
// 十分安全な許容範囲と判断した値（値そのものに強い実務上の意味を求める場面が出てきた
// 場合は、各データ変更系Server ActionからrevalidateTag("reference-data")を呼ぶ形に
// 拡張できる）。
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

const CACHE_OPTIONS = { revalidate: 30, tags: ["reference-data"] };

export const getKarteRouteNameOptions = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await prisma.karte.findMany({
      distinct: ["routeName"],
      select: { routeName: true },
      orderBy: { routeName: "asc" },
    });
    return rows.map((r) => r.routeName).filter(Boolean);
  },
  ["reference-data:karte-route-name"],
  CACHE_OPTIONS
);

export const getFacilityListRouteNameOptions = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await prisma.facilityListItem.findMany({
      distinct: ["routeName"],
      select: { routeName: true },
      orderBy: { routeName: "asc" },
    });
    return rows.map((r) => r.routeName).filter((v): v is string => !!v);
  },
  ["reference-data:facility-list-route-name"],
  CACHE_OPTIONS
);

// 施設台帳タブの「路線名」を道路種別（国道／県道／市町村道等）で2段階に絞り込む
// ための、路線名＋道路種別のペア一覧（会話ログ「路線名検索を道路種別＋路線名の
// 2段階にする」参照）。FacilityListItem.routeTypeは実データ由来の信頼できる
// 値（国道・主要地方道・一般県道・1級町道・2級町道・その他市道・その他町道）を
// 持っているため、これをそのまま使う（他のroutedName源＝Karte・FacilityLedgerには
// 道路種別を示す列が無く、実データで突き合わせても一致が無かったため、2段階化の
// 対象は施設台帳タブのみに限定している。app/karte/page.tsxのROAD_TYPE_GROUPS参照）。
export const getFacilityListRouteOptionsWithType = unstable_cache(
  async (): Promise<{ routeName: string; routeType: string | null }[]> => {
    const rows = await prisma.facilityListItem.findMany({
      distinct: ["routeName"],
      select: { routeName: true, routeType: true },
      orderBy: { routeName: "asc" },
    });
    return rows.filter((r): r is { routeName: string; routeType: string | null } => !!r.routeName);
  },
  ["reference-data:facility-list-route-with-type"],
  CACHE_OPTIONS
);

export const getFacilityListSoundnessGradeOptions = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await prisma.facilityListItem.findMany({
      distinct: ["soundnessGrade"],
      select: { soundnessGrade: true },
      orderBy: { soundnessGrade: "asc" },
    });
    return rows.map((r) => r.soundnessGrade).filter((v): v is string => !!v);
  },
  ["reference-data:facility-list-soundness-grade"],
  CACHE_OPTIONS
);

// 点検調書（防災＝Karte）の路線名に対する道路種別の手動設定一覧
// （会話ログ「道路種別が決まっていない道路を手動で分類できる仕様」参照。
// /settingsで編集する。prisma/schema.prismaのRouteRoadTypeOverride参照）。
export const getRouteRoadTypeOverrides = unstable_cache(
  async (): Promise<{ routeName: string; roadTypeGroup: string }[]> => {
    return prisma.routeRoadTypeOverride.findMany({ select: { routeName: true, roadTypeGroup: true } });
  },
  ["reference-data:route-road-type-overrides"],
  CACHE_OPTIONS
);

export const getFacilityLedgerRouteNameOptions = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await prisma.facilityLedger.findMany({
      distinct: ["routeName"],
      select: { routeName: true },
      orderBy: { routeName: "asc" },
    });
    return rows.map((r) => r.routeName).filter((v): v is string => !!v);
  },
  ["reference-data:facility-ledger-route-name"],
  CACHE_OPTIONS
);
