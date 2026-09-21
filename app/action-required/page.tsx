import Link from "next/link";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/BackLink";
import { KARTE_TYPE_LABEL, responseMeta, JUDGMENT_BADGE } from "@/lib/labels";
import {
  type UnifiedTier,
  UNIFIED_TIER_LABEL,
  UNIFIED_TIER_BADGE,
  judgment1to4ToTier,
  judgment1to3ToTier,
  karteResponseCategoryToTier,
} from "@/lib/unified-status";

export const dynamic = "force-dynamic";

// 横断的な「要対応一覧」ダッシュボード（会話ログ「横断的な『要対応一覧』
// ダッシュボード（Ⅰ：対応不要／Ⅱ：経過観察／Ⅲ：要対策で統一表記）」参照）。
//
// カルテ（点検調書＞災害）・点検調書（門型標識・橋梁・法面構造物）は、
// それぞれ別のタブ・別の検索条件でしか横断できず、「今どこが経過観察／
// 要対策なのか」を確認するには4箇所を個別に見て回る必要があった。この画面は
// 各データソースから「対応不要（監視不要）ではない」行だけを集め、統一区分
// （lib/unified-status.ts参照）で束ねて1つの一覧として見せる。
//
// 元データ自体（各詳細画面の判定値）は一切変更しない、あくまで横断参照用の
// 読み取り専用ビュー。年度別履歴チェーンを持つ3種（門型標識・橋梁・
// 法面構造物）は、現在有効な最新レコードのみを対象にする（過去年度分は
// 対象外）。
type Row = {
  kind: "karte" | "gateSignInspection" | "bridgeInspection" | "slopeStructureInspection";
  kindLabel: string;
  id: string;
  title: string;
  subtitle: string | null;
  routeName: string | null;
  location: string | null;
  tier: UnifiedTier;
  rawLabel: string; // 元の判定値の表示（例:「Ⅲ」「対策工が必要」）
  rawBadgeClass: string;
  href: string;
};

const TIER_ORDER: UnifiedTier[] = ["action_needed", "monitor"];

export default async function ActionRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; kind?: string }>;
}) {
  const params = await searchParams;
  const tierFilter = params.tier === "action_needed" || params.tier === "monitor" ? params.tier : null;
  const kindFilter =
    params.kind === "karte" ||
    params.kind === "gateSignInspection" ||
    params.kind === "bridgeInspection" ||
    params.kind === "slopeStructureInspection"
      ? params.kind
      : null;

  const [kartes, gateSigns, bridges, slopes] = await Promise.all([
    prisma.karte.findMany({
      where: { responseCategory: { in: ["COUNTERMEASURE_NEEDED", "HANDLED_BY_KARTE"] } },
      select: {
        id: true,
        facilityNo: true,
        routeName: true,
        karteType: true,
        responseCategory: true,
        locationDistrict: true,
        locationTown: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.gateSignInspection.findMany({
      where: { supersededByInspection: { is: null }, overallJudgment: { in: ["Ⅱ", "Ⅲ", "Ⅳ"] } },
      select: {
        id: true,
        managementNo: true,
        sourceFileName: true,
        routeName: true,
        location: true,
        overallJudgment: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.bridgeInspection.findMany({
      where: { supersededByInspection: { is: null }, overallJudgment: { in: ["Ⅱ", "Ⅲ", "Ⅳ"] } },
      select: { id: true, bridgeName: true, managementNo: true, sourceFileName: true, routeName: true, location: true, overallJudgment: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.slopeStructureInspection.findMany({
      where: { supersededByInspection: { is: null }, overallJudgment: { in: ["Ⅱ", "Ⅲ"] } },
      select: { id: true, managementNo: true, sourceFileName: true, routeName: true, location: true, overallJudgment: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const rows: Row[] = [];

  for (const k of kartes) {
    const tier = karteResponseCategoryToTier(k.responseCategory);
    if (!tier) continue;
    const meta = responseMeta(k.responseCategory);
    rows.push({
      kind: "karte",
      kindLabel: "点検調書（防災）",
      id: k.id,
      title: k.routeName,
      subtitle: k.facilityNo,
      routeName: k.routeName,
      location: [k.locationDistrict, k.locationTown].filter(Boolean).join(" ") || null,
      tier,
      rawLabel: `${meta.label}（${KARTE_TYPE_LABEL[k.karteType] ?? k.karteType}）`,
      rawBadgeClass: meta.badgeColor,
      href: `/karte/${k.facilityNo}`,
    });
  }

  for (const g of gateSigns) {
    const tier = judgment1to4ToTier(g.overallJudgment);
    if (!tier) continue;
    rows.push({
      kind: "gateSignInspection",
      kindLabel: "点検調書（門型標識）",
      id: g.id,
      title: g.managementNo ?? g.sourceFileName ?? "（管理番号不明）",
      subtitle: null,
      routeName: g.routeName,
      location: g.location,
      tier,
      rawLabel: `判定区分 ${g.overallJudgment}`,
      rawBadgeClass: JUDGMENT_BADGE[g.overallJudgment ?? ""] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
      href: `/inspections/gate-signs/${g.id}`,
    });
  }

  for (const b of bridges) {
    const tier = judgment1to4ToTier(b.overallJudgment);
    if (!tier) continue;
    rows.push({
      kind: "bridgeInspection",
      kindLabel: "点検調書（橋梁）",
      id: b.id,
      title: b.bridgeName ?? b.managementNo ?? b.sourceFileName ?? "（橋梁名不明）",
      subtitle: null,
      routeName: b.routeName,
      location: b.location,
      tier,
      rawLabel: `判定区分 ${b.overallJudgment}`,
      rawBadgeClass: JUDGMENT_BADGE[b.overallJudgment ?? ""] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
      href: `/inspections/bridges/${b.id}`,
    });
  }

  for (const s of slopes) {
    const tier = judgment1to3ToTier(s.overallJudgment);
    if (!tier) continue;
    rows.push({
      kind: "slopeStructureInspection",
      kindLabel: "点検調書（法面構造物）",
      id: s.id,
      title: s.managementNo ?? s.sourceFileName ?? "（箇所番号不明）",
      subtitle: null,
      routeName: s.routeName,
      location: s.location,
      tier,
      rawLabel: `点検者の評価 ${s.overallJudgment}`,
      rawBadgeClass: JUDGMENT_BADGE[s.overallJudgment ?? ""] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
      href: `/inspections/slopes/${s.id}`,
    });
  }

  rows.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

  const countsByTier: Record<UnifiedTier, number> = { no_action: 0, monitor: 0, action_needed: 0 };
  for (const r of rows) countsByTier[r.tier]++;

  const visibleRows = rows
    .filter((r) => !tierFilter || r.tier === tierFilter)
    .filter((r) => !kindFilter || r.kind === kindFilter);

  const KIND_OPTIONS: { key: Row["kind"]; label: string }[] = [
    { key: "karte", label: "点検調書（防災）" },
    { key: "gateSignInspection", label: "門型標識" },
    { key: "bridgeInspection", label: "橋梁" },
    { key: "slopeStructureInspection", label: "法面構造物" },
  ];

  function buildHref(overrides: { tier?: string | null; kind?: string | null }): string {
    const usp = new URLSearchParams();
    const nextTier = overrides.tier !== undefined ? overrides.tier : tierFilter;
    const nextKind = overrides.kind !== undefined ? overrides.kind : kindFilter;
    if (nextTier) usp.set("tier", nextTier);
    if (nextKind) usp.set("kind", nextKind);
    const qs = usp.toString();
    return qs ? `/action-required?${qs}` : "/action-required";
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <BackLink fallbackHref="/karte">
        ← 地図に戻る
      </BackLink>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">⚠ 要対応一覧</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        カルテ（点検調書＞災害）・点検調書（門型標識・橋梁・法面構造物）のうち、経過観察または要対策と評価されているものを横断的にまとめた一覧です。判定の考え方が種別ごとに異なるため（下記参照）、統一区分と併せて元の判定値も表示しています。
      </p>
      <details className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        <summary className="cursor-pointer select-none font-medium">統一区分の考え方について</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>門型標識・橋梁: 健全性の診断（Ⅰ健全〜Ⅳ緊急措置段階）。Ⅲ・Ⅳをまとめて「要対策」としています。</li>
          <li>法面構造物: 点検者の評価（Ⅰ対応不要〜Ⅲ要対策）。そのまま対応します。</li>
          <li>カルテ: 対応区分。「対策工が必要」→要対策、「カルテ対応」→経過観察、「対策不要」「対策完了」→対応不要（未評価は対象外）。</li>
        </ul>
      </details>

      <div className="flex flex-wrap gap-2">
        {TIER_ORDER.map((tier) => (
          <Link
            key={tier}
            href={buildHref({ tier: tierFilter === tier ? null : tier })}
            className={`rounded-full border px-3 py-1 text-xs ${
              tierFilter === tier
                ? "border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900"
                : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
            }`}
          >
            {UNIFIED_TIER_LABEL[tier]}（{countsByTier[tier]}）
          </Link>
        ))}
        {tierFilter && (
          <Link href={buildHref({ tier: null })} className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-400 hover:border-gray-400 dark:border-gray-600 dark:text-gray-500">
            絞り込み解除
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 border-l-2 border-gray-200 pl-2 dark:border-gray-700">
        <Link
          href={buildHref({ kind: null })}
          className={`rounded-full border px-2.5 py-1 text-xs ${
            !kindFilter
              ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500"
              : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
          }`}
        >
          すべての種別
        </Link>
        {KIND_OPTIONS.map((opt) => (
          <Link
            key={opt.key}
            href={buildHref({ kind: kindFilter === opt.key ? null : opt.key })}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              kindFilter === opt.key
                ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500"
                : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 dark:bg-gray-700 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-3 py-2">統一区分</th>
              <th className="px-3 py-2">種別</th>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">元の判定</th>
              <th className="px-3 py-2">路線名</th>
              <th className="px-3 py-2">所在地</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${UNIFIED_TIER_BADGE[r.tier]}`}>{UNIFIED_TIER_LABEL[r.tier]}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{r.kindLabel}</td>
                <td className="px-3 py-2">
                  <Link href={r.href} className="text-blue-600 dark:text-blue-400 hover:underline">
                    {r.title}
                  </Link>
                  {r.subtitle && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{r.subtitle}</span>}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${r.rawBadgeClass}`}>{r.rawLabel}</span>
                </td>
                <td className="px-3 py-2">{r.routeName ?? "—"}</td>
                <td className="px-3 py-2">{r.location ?? "—"}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                  条件に一致する対応が必要な記録はありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
