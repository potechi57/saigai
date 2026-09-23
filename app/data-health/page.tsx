import Link from "next/link";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// 既存データの健全性チェック（会話ログ「既存データの健全性チェック（スキーマ
// 更新後に再取込みされていない古いレコードを検知・案内）」（フェーズ3）への対応）。
//
// 【当初検討した「スキーマバージョン」方式について】各レコードに取込み時の
// スキーマ/パーサーのバージョン番号を持たせ、現在のバージョンと比較する方式を
// 検討したが、(1) 既存レコードにバージョン列が無く、遡って正しい値を割り当てる
// 手段が無い（レコードの作成日時＝createdAtは実時刻である一方、マイグレーション
// フォルダ名の日付は開発上の連番ラベルであり実時刻と対応しないため、両者を比較
// して「このレコードはこの日付のマイグレーション以前に作られた」と判定すること
// はできないと実データで確認済み）、(2) 新規カラムの値がたまたまnullなだけ
// （例: GateSignInspection.idNumberはExcel側も空欄のことが多い）と「未再取込み」
// を区別できない項目もあるため、正確なバージョン判定は断念した。
//
// 代わりに、実データで「正常に取り込めていれば通常は値が入るはず」と確認できて
// いる項目の組み合わせが軒並みnullな場合を「取込みが不完全（古いパーサーでの
// 取込み、または取込み自体が一部失敗した可能性）」とみなして検知する、内容ベースの
// チェックに絞った。検知条件・理由は各チェックの一覧に明示し、断定はしない
// （「〜の可能性があります」という案内に留め、実際に対応するかはユーザー判断に
// 委ねる）。
type Finding = {
  kind: string;
  id: string;
  title: string;
  reason: string;
  href: string;
  reimportHref: string;
};

export default async function DataHealthPage() {
  const findings: Finding[] = [];

  // (1) 橋梁点検調書: 「道路橋様式１」自体の項目（管理者名・架設年次・橋長・
  // 橋梁形式）が実データでは通常すべて埋まることを確認済み（会話ログ「エクセルに
  // 書いてある通りに実装してほしい」対応時、実ファイルで確認）。全てnullの場合、
  // この項目群が追加される前（旧パーサー）で取り込まれた可能性が高い。
  const staleBridges = await prisma.bridgeInspection.findMany({
    where: {
      supersededByInspection: { is: null },
      managerOrgName: null,
      installedYear: null,
      bridgeLengthM: null,
      structureType: null,
    },
    select: { id: true, bridgeName: true, managementNo: true, sourceFileName: true },
  });
  for (const b of staleBridges) {
    findings.push({
      kind: "点検調書（橋梁）",
      id: b.id,
      title: b.bridgeName ?? b.managementNo ?? b.sourceFileName ?? "（橋梁名不明）",
      reason: "様式１の管理者名・架設年次・橋長・橋梁形式が未取得です。古いバージョンで取り込まれた可能性があります。",
      href: `/inspections/bridges/${b.id}`,
      reimportHref: "/inspections/bridges/import",
    });
  }

  // (2) 写真が1枚も取り込まれていない点検調書（門型標識・橋梁・法面構造物）。
  // これら3種はいずれも様式上、最低限「現況写真」相当の画像を持つ想定のため、
  // 0件は取込み時の異常（Excel構成の想定外・画像抽出失敗等）を示唆する。
  const [gateSignsNoPhoto, bridgesNoPhoto, slopesNoPhoto] = await Promise.all([
    prisma.gateSignInspection.findMany({
      where: { supersededByInspection: { is: null }, overviewPhotos: { none: {} } },
      select: { id: true, managementNo: true, sourceFileName: true },
    }),
    prisma.bridgeInspection.findMany({
      where: { supersededByInspection: { is: null }, photos: { none: {} } },
      select: { id: true, bridgeName: true, managementNo: true, sourceFileName: true },
    }),
    prisma.slopeStructureInspection.findMany({
      where: { supersededByInspection: { is: null }, photos: { none: {} } },
      select: { id: true, managementNo: true, sourceFileName: true },
    }),
  ]);
  for (const g of gateSignsNoPhoto) {
    findings.push({
      kind: "点検調書（門型標識）",
      id: g.id,
      title: g.managementNo ?? g.sourceFileName ?? "（管理番号不明）",
      reason: "写真が1枚も取り込まれていません。",
      href: `/inspections/gate-signs/${g.id}`,
      reimportHref: "/inspections/gate-signs/import",
    });
  }
  for (const b of bridgesNoPhoto) {
    findings.push({
      kind: "点検調書（橋梁）",
      id: b.id,
      title: b.bridgeName ?? b.managementNo ?? b.sourceFileName ?? "（橋梁名不明）",
      reason: "写真が1枚も取り込まれていません。",
      href: `/inspections/bridges/${b.id}`,
      reimportHref: "/inspections/bridges/import",
    });
  }
  for (const s of slopesNoPhoto) {
    findings.push({
      kind: "点検調書（法面構造物）",
      id: s.id,
      title: s.managementNo ?? s.sourceFileName ?? "（箇所番号不明）",
      reason: "写真が1枚も取り込まれていません。",
      href: `/inspections/slopes/${s.id}`,
      reimportHref: "/inspections/slopes/import",
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <BackLink fallbackHref="/map">
        ← 地図に戻る
      </BackLink>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">🩺 既存データの健全性チェック</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        点検調書（門型標識・橋梁・法面構造物）のうち、取込み内容が不完全である可能性がある記録を検出します。断定はできないため、該当した記録は詳細画面で内容を確認のうえ、必要に応じてExcelを再取込みしてください。
      </p>

      <div className="rounded border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-300 px-4 py-2 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">検出結果 — {findings.length}件</h2>
        </div>
        {findings.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">検出された問題はありません。</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {findings.map((f) => (
              <li key={`${f.kind}-${f.id}`} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {f.kind}
                    </span>
                    <Link href={f.href} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                      {f.title}
                    </Link>
                  </div>
                  <Link href={f.reimportHref} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                    Excelを再取込み →
                  </Link>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{f.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
