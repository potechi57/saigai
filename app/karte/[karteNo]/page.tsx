import { Fragment } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL, ROAD_TYPE_LABEL, WEATHER_LABEL, responseMeta, RESPONSE_META } from "@/lib/labels";
import PhotoUploadForm from "@/components/PhotoUploadForm";

// 一覧画面と同じ理由で静的プリレンダリングを無効化する。
export const dynamic = "force-dynamic";

const PROJECT_CATEGORY_LABEL: Record<string, string> = { GENERAL: "一般", TOLL: "有料" };
const ROAD_STATUS_LABEL: Record<string, string> = { CURRENT: "現道", OLD: "旧道", NEW: "新道", NEWEST: "新新道" };
const GEODETIC_LABEL: Record<string, string> = { WORLD: "世界測地系", JAPAN: "日本測地系" };
const RESPONSE_CHOICES: { value: string; no: string; label: string }[] = [
  { value: "COUNTERMEASURE_NEEDED", no: "①", label: "対策工が必要" },
  { value: "HANDLED_BY_KARTE", no: "②", label: "カルテ対応" },
  { value: "NO_COUNTERMEASURE_NEEDED", no: "③", label: "対策不要" },
  { value: "COUNTERMEASURE_COMPLETED", no: "④", label: "対策完了" },
];

// カルテ詳細画面。
// 「Excelとしてある防災カルテをWeb上で見るためのツール」という位置づけのため、
// 実際の防災カルテ様式Ａ・様式Ｃ（全国地質調査業協会連合会版）の見た目・項目配置に
// できるだけ近づけた表形式で表示する（指示書9章の画面構成案よりも、実物の様式への
// 忠実さを優先している）。Web版ならではの付加価値（点検対象ごとの過年度写真比較等）は
// 様式Ｃ相当の表の下に追加のセクションとして残す。
export default async function KarteDetailPage({
  params,
}: {
  params: Promise<{ karteNo: string }>;
}) {
  const { karteNo } = await params;
  const karte = await prisma.karte.findUnique({
    where: { facilityNo: karteNo },
    include: {
      rockfallDetail: true,
      photos: {
        where: { targetId: null, eventId: null, disasterEventId: null },
        orderBy: { takenAt: "asc" },
      },
      targets: {
        orderBy: { displayOrder: "asc" },
        include: { photos: { orderBy: { takenAt: "asc" } } },
      },
      events: {
        orderBy: { inspectionDate: "asc" },
        include: { results: true },
      },
      disasterEvents: {
        orderBy: { occurredDate: "desc" },
        include: { photos: true },
      },
      attachments: { orderBy: { uploadedAt: "desc" } },
    },
  });

  if (!karte) notFound();

  const resultByTargetAndEvent = new Map<string, (typeof karte.events)[number]["results"][number]>();
  for (const ev of karte.events) {
    for (const r of ev.results) {
      resultByTargetAndEvent.set(`${r.targetId}:${ev.id}`, r);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          ← 検索・一覧に戻る
        </Link>
        <Link
          href={`/karte/${karte.facilityNo}/edit`}
          className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          カルテを編集
        </Link>
      </div>

      {/* ── 防災カルテ様式Ａ相当 ─────────────────────────────── */}
      <section className="overflow-x-auto rounded border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2">
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-100">
            防災カルテ様式Ａ　（{KARTE_TYPE_LABEL[karte.karteType] ?? karte.karteType}）
          </h1>
          <div className="text-right text-xs text-gray-600 dark:text-gray-300">
            <div>管理機関名: {karte.manageOrgName || "—"}</div>
            <div>管理機関コード: {karte.manageOrgCode || "—"}</div>
          </div>
        </div>

        <table className="w-full min-w-[900px] border-collapse text-xs">
          <tbody>
            <tr>
              <Th>施設管理番号</Th>
              <Td colSpan={2}>{karte.facilityNo}</Td>
              <Th>路線名</Th>
              <Td colSpan={2}>{karte.routeName}</Td>
              <Th>上下線の別</Th>
              <Td>{karte.sideOfRoad || "—"}</Td>
            </tr>
            <tr>
              <Th>距離標</Th>
              <Td colSpan={2}>
                自 {karte.distanceMarkerFromKm?.toString() ?? "—"} km 〜 至 {karte.distanceMarkerToKm?.toString() ?? "—"} km
              </Td>
              <Th>延長</Th>
              <Td colSpan={2}>{karte.extensionLengthM ? `${karte.extensionLengthM} m` : "—"}</Td>
              <Th>対応区分</Th>
              <Td>
                <span className={`rounded px-1.5 py-0.5 ${responseMeta(karte.responseCategory).badgeColor}`}>
                  {responseMeta(karte.responseCategory).label}
                </span>
              </Td>
            </tr>
            <tr>
              <Th>事業区分</Th>
              <Td>{karte.projectCategory ? PROJECT_CATEGORY_LABEL[karte.projectCategory] : "—"}</Td>
              <Th>道路種別</Th>
              <Td>{karte.roadType ? ROAD_TYPE_LABEL[karte.roadType] ?? karte.roadType : "—"}</Td>
              <Th>現道・旧道区分</Th>
              <Td colSpan={3}>{karte.roadStatus ? ROAD_STATUS_LABEL[karte.roadStatus] : "—"}</Td>
            </tr>
            <tr>
              <Th>所在地</Th>
              <Td colSpan={2}>{[karte.locationDistrict, karte.locationTown].filter(Boolean).join(" ") || "—"}</Td>
              <Th>位置目印</Th>
              <Td colSpan={2}>{karte.landmark || "—"}</Td>
              <Th>測地系</Th>
              <Td>{karte.geodeticSystem ? GEODETIC_LABEL[karte.geodeticSystem] : "—"}</Td>
            </tr>
            <tr>
              <Th>北緯・東経</Th>
              <Td colSpan={2}>
                {karte.latitude && karte.longitude ? `${karte.latitude}, ${karte.longitude}` : "—"}
              </Td>
              <Th>専門技術者による点検</Th>
              <Td colSpan={2}>
                {karte.specialistInspectionRequired === null
                  ? "—"
                  : karte.specialistInspectionRequired
                    ? "有"
                    : "無"}
              </Td>
              <Th>評価年月日</Th>
              <Td>
                {karte.responseEvaluatedAt
                  ? new Date(karte.responseEvaluatedAt).toLocaleDateString("ja-JP")
                  : "—"}
              </Td>
            </tr>
            <tr>
              <Th>台帳番号</Th>
              <Td>{karte.ledgerNo || "—"}</Td>
              <Th>事前通行規制区間指定</Th>
              <Td>{yesNo(karte.preTrafficRestriction)}</Td>
              <Th>緊急輸送道路区分</Th>
              <Td colSpan={3}>{karte.emergencyRoadCategory || "—"}</Td>
            </tr>
            <tr>
              <Th>交通量</Th>
              <Td>
                {karte.trafficVolumeWeekday != null
                  ? `平日 ${karte.trafficVolumeWeekday} 台/12h`
                  : karte.trafficVolumeHoliday != null
                    ? `休日 ${karte.trafficVolumeHoliday} 台/12h`
                    : "—"}
              </Td>
              <Th>ＤＩＤ区間</Th>
              <Td>{yesNoLabel(karte.didArea, "該当", "非該当")}</Td>
              <Th>バス路線</Th>
              <Td>{yesNoLabel(karte.busRoute, "該当", "非該当")}</Td>
              <Th>迂回路</Th>
              <Td>{yesNo(karte.detour)}</Td>
            </tr>

            <tr>
              <Th rowSpan={1} className="align-top">
                点検地点位置図
                <br />
                現況写真
              </Th>
              <td colSpan={8} className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 align-top">
                {karte.photos.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {karte.photos.map((p) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.caption ?? undefined}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={p.caption ?? "点検地点位置図"}
                          className="h-28 w-28 rounded border border-gray-300 dark:border-gray-700 object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mb-2 text-gray-400 dark:text-gray-500">未登録（カルテ編集画面から追加できます）</p>
                )}
              </td>
            </tr>

            <tr>
              <Th className="align-top">着目すべき変状</Th>
              <td colSpan={3} className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 align-top whitespace-pre-wrap">
                {karte.keyDeformationSummary || "—"}
              </td>
              <Th className="align-top">点検内容の要点</Th>
              <td colSpan={4} className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 align-top whitespace-pre-wrap">
                {karte.inspectionContentSummary || "—"}
              </td>
            </tr>
            <tr>
              <Th className="align-top">専門技術者のコメント</Th>
              <td colSpan={8} className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 align-top whitespace-pre-wrap">
                {karte.specialistComment || "—"}
              </td>
            </tr>

            <tr>
              <Th>着目すべき変状</Th>
              <Th>点検の時期</Th>
              <Th colSpan={2}>想定される災害形態</Th>
              <Th colSpan={2}>変状が出たときの対応</Th>
              <Th colSpan={2}>点検者</Th>
              <Th>専門技術者</Th>
            </tr>
            <tr>
              <td className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 align-top whitespace-pre-wrap">
                {karte.keyDeformationSummary || "—"}
              </td>
              <td className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 align-top">
                {karte.inspectionPeriodType === "REGULAR"
                  ? "定期"
                  : karte.inspectionPeriodType === "IRREGULAR"
                    ? "不定期"
                    : "—"}
                {karte.inspectionIntervalNote && <div className="text-gray-500 dark:text-gray-400">{karte.inspectionIntervalNote}</div>}
              </td>
              <td colSpan={2} className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 align-top whitespace-pre-wrap">
                {karte.assumedDisasterForm || "—"}
              </td>
              <td colSpan={2} className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 align-top whitespace-pre-wrap">
                {karte.responseWhenDeformed || "—"}
              </td>
              <td colSpan={2} className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 align-top">
                {karte.inspectorName || "—"}
                {karte.inspectorCompany && <div className="text-gray-500 dark:text-gray-400">{karte.inspectorCompany}</div>}
                {karte.inspectorTel && <div className="text-gray-500 dark:text-gray-400">{karte.inspectorTel}</div>}
              </td>
              <td className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 align-top">
                {karte.specialistName || "—"}
                {karte.specialistCompany && <div className="text-gray-500 dark:text-gray-400">{karte.specialistCompany}</div>}
                {karte.specialistTel && <div className="text-gray-500 dark:text-gray-400">{karte.specialistTel}</div>}
              </td>
            </tr>

            <tr>
              <Th>作成年月日</Th>
              <Td colSpan={2}>
                {karte.createdOnSiteDate ? new Date(karte.createdOnSiteDate).toLocaleDateString("ja-JP") : "—"}
              </Td>
              <Th>天候</Th>
              <Td colSpan={5}>
                {karte.createdOnSiteWeather ? WEATHER_LABEL[karte.createdOnSiteWeather] : "—"}
              </Td>
            </tr>

            {karte.rockfallDetail && (
              <tr>
                <Th>主な災害形態</Th>
                <Td colSpan={8}>
                  {[
                    karte.rockfallDetail.mainFormRockfall && "落石",
                    karte.rockfallDetail.mainFormCollapse && "崩壊",
                  ]
                    .filter(Boolean)
                    .join("・") || "—"}
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ── 防災カルテ様式Ｃ相当（点検履歴） ─────────────────────── */}
      <section className="overflow-x-auto rounded border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">防災カルテ様式Ｃ　（点検履歴）</h2>
          <div className="flex gap-3 text-sm">
            <Link href={`/karte/${karte.facilityNo}/targets/new`} className="text-blue-600 dark:text-blue-400 hover:underline">
              ＋ 点検対象を追加
            </Link>
            <Link href={`/karte/${karte.facilityNo}/events/new`} className="text-blue-600 dark:text-blue-400 hover:underline">
              ＋ 点検記録を登録
            </Link>
          </div>
        </div>

        {karte.events.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 dark:text-gray-500">点検記録がまだありません</p>
        ) : (
          <table className="w-full min-w-[700px] border-collapse text-xs">
            <thead>
              <tr>
                <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">点検年月日</Th>
                {karte.events.map((ev) => (
                  <Th key={ev.id}>{new Date(ev.inspectionDate).toLocaleDateString("ja-JP")}</Th>
                ))}
              </tr>
              <tr>
                <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">点検者名</Th>
                {karte.events.map((ev) => (
                  <Td key={ev.id}>{ev.inspectorName || "—"}</Td>
                ))}
              </tr>
              <tr>
                <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">天候</Th>
                {karte.events.map((ev) => (
                  <Td key={ev.id}>{ev.weather ? WEATHER_LABEL[ev.weather] : "—"}</Td>
                ))}
              </tr>
            </thead>
            <tbody>
              {karte.targets.map((t) => (
                <Fragment key={t.id}>
                  <tr key={`${t.id}-label`}>
                    <td
                      colSpan={karte.events.length + 1}
                      className={`border border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-2 py-1 font-medium text-gray-700 dark:text-gray-200 ${
                        !t.isActive ? "opacity-50" : ""
                      }`}
                    >
                      {karte.facilityNo}-T{String(t.sequenceNo).padStart(2, "0")} {t.name}
                      {!t.isActive && <span className="ml-2 text-gray-500 dark:text-gray-400">（解消済み）</span>}
                      <Link
                        href={`/karte/${karte.facilityNo}/targets/${t.id}/edit`}
                        className="ml-3 font-normal text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        編集
                      </Link>
                    </td>
                  </tr>
                  <tr key={`${t.id}-diff`}>
                    <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">前回との差異</Th>
                    {karte.events.map((ev) => {
                      const r = resultByTargetAndEvent.get(`${t.id}:${ev.id}`);
                      return <Td key={ev.id}>{r ? (r.diffFromPrevious ? "有" : "無") : "—"}</Td>;
                    })}
                  </tr>
                  <tr key={`${t.id}-disaster`}>
                    <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">被災履歴</Th>
                    {karte.events.map((ev) => {
                      const r = resultByTargetAndEvent.get(`${t.id}:${ev.id}`);
                      return <Td key={ev.id}>{r ? (r.disasterHistory ? "有" : "無") : "—"}</Td>;
                    })}
                  </tr>
                  <tr key={`${t.id}-repair`}>
                    <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">補修履歴</Th>
                    {karte.events.map((ev) => {
                      const r = resultByTargetAndEvent.get(`${t.id}:${ev.id}`);
                      return <Td key={ev.id}>{r ? (r.repairHistory ? "有" : "無") : "—"}</Td>;
                    })}
                  </tr>
                  <tr key={`${t.id}-comment`}>
                    <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">コメント</Th>
                    {karte.events.map((ev) => {
                      const r = resultByTargetAndEvent.get(`${t.id}:${ev.id}`);
                      return (
                        <Td key={ev.id} className="whitespace-pre-wrap">
                          {r?.comment || "—"}
                        </Td>
                      );
                    })}
                  </tr>
                  <tr key={`${t.id}-photos`}>
                    <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">写真</Th>
                    <td colSpan={karte.events.length} className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 p-2">
                      {t.photos.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {t.photos.map((p) => (
                            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.caption ?? undefined}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.url}
                                alt={p.caption ?? "点検写真"}
                                className="h-16 w-16 rounded border border-gray-200 dark:border-gray-700 object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      <PhotoUploadForm targetId={t.id} karteId={karte.id} karteFacilityNo={karte.facilityNo} compact />
                    </td>
                  </tr>
                </Fragment>
              ))}

              <tr>
                <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">点検後の対応（専門技術者の判定）</Th>
                {karte.events.map((ev) => (
                  <Td key={ev.id}>{ev.specialistJudgement ? RESPONSE_META[ev.specialistJudgement]?.label : "—"}</Td>
                ))}
              </tr>
              <tr>
                <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">専門技術者による点検年月日</Th>
                {karte.events.map((ev) => (
                  <Td key={ev.id}>
                    {ev.specialistInspectionDate
                      ? new Date(ev.specialistInspectionDate).toLocaleDateString("ja-JP")
                      : "—"}
                  </Td>
                ))}
              </tr>
              <tr>
                <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">専門技術者名</Th>
                {karte.events.map((ev) => (
                  <Td key={ev.id}>{ev.specialistName || "—"}</Td>
                ))}
              </tr>
              <tr>
                <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">次回点検実施時期</Th>
                {karte.events.map((ev) => (
                  <Td key={ev.id}>{ev.nextInspectionDueYear ? `${ev.nextInspectionDueYear}年度` : "—"}</Td>
                ))}
              </tr>
              <tr>
                <Th className="sticky left-0 bg-gray-100 dark:bg-gray-700">点検時の特記事項</Th>
                {karte.events.map((ev) => (
                  <Td key={ev.id} className="whitespace-pre-wrap">
                    {ev.specialTopics || "—"}
                  </Td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
        {karte.targets.length === 0 && (
          <p className="p-4 text-sm text-gray-400 dark:text-gray-500">点検対象が登録されていません</p>
        )}
      </section>

      {/* ── 防災カルテ様式Ｄ相当（災害履歴） ─────────────────────── */}
      <section className="rounded border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">防災カルテ様式Ｄ　（災害履歴）</h2>
        </div>
        {karte.disasterEvents.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 dark:text-gray-500">記録された災害履歴はありません</p>
        ) : (
          <div className="divide-y divide-gray-300 dark:divide-gray-700">
            {karte.disasterEvents.map((d) => (
              <div key={d.id} className="overflow-x-auto p-2">
                <table className="w-full min-w-[700px] border-collapse text-xs">
                  <tbody>
                    <tr>
                      <Th>発生年月日</Th>
                      <Td>{d.occurredDate ? new Date(d.occurredDate).toLocaleDateString("ja-JP") : "—"}</Td>
                      <Th>規模</Th>
                      <Td colSpan={3}>
                        幅 {d.scaleWidthM?.toString() ?? "—"} m ／ 長さ {d.scaleLengthM?.toString() ?? "—"} m ／ 深さ{" "}
                        {d.scaleDepthM?.toString() ?? "—"} m
                      </Td>
                    </tr>
                    <tr>
                      <Th>誘因</Th>
                      <Td colSpan={5} className="whitespace-pre-wrap">
                        {[
                          d.rainContinuousMm && `連続雨量 ${d.rainContinuousMm}mm`,
                          d.rainMaxHourlyMm && `最大時間雨量 ${d.rainMaxHourlyMm}mm/hr`,
                          d.seismicIntensity && `震度 ${d.seismicIntensity}`,
                          d.seismicAccelerationGal && `加速度 ${d.seismicAccelerationGal}gal`,
                          d.snowTemperatureC && `気温 ${d.snowTemperatureC}℃`,
                          d.snowDepthM && `積雪深 ${d.snowDepthM}m`,
                        ]
                          .filter(Boolean)
                          .join(" / ") || d.causeComment || "—"}
                      </Td>
                    </tr>
                    <tr>
                      <Th>被害</Th>
                      <Td colSpan={5}>
                        死者 {d.damageDeaths ?? 0}人 ／ 負傷者 {d.damageInjured ?? 0}人
                        {d.propertyDamageAmountMillionYen ? ` ／ 物損 ${d.propertyDamageAmountMillionYen}百万円` : ""}
                        {d.propertyDamageComment ? ` （${d.propertyDamageComment}）` : ""}
                      </Td>
                    </tr>
                    <tr>
                      <Th>通行止め実績</Th>
                      <Td colSpan={2}>
                        全面 {d.closureFullHours?.toString() ?? 0}時間 ／ 片側 {d.closurePartialHours?.toString() ?? 0}時間
                        {d.shoulderRestriction ? "／ 路肩規制あり" : ""}
                      </Td>
                      <Th>対策工</Th>
                      <Td colSpan={2}>
                        {d.countermeasureFiscalYear ? `${d.countermeasureFiscalYear}年度` : "—"}
                        {d.countermeasureType || ""}
                        {d.countermeasureCostMillionYen ? `（概算 ${d.countermeasureCostMillionYen}百万円）` : ""}
                      </Td>
                    </tr>
                    {d.comment && (
                      <tr>
                        <Th>コメント</Th>
                        <Td colSpan={5} className="whitespace-pre-wrap">
                          {d.comment}
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── カルテ資料 ─────────────────────────────────────── */}
      <section className="rounded border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">カルテ資料</h2>
        </div>
        {karte.attachments.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 dark:text-gray-500">登録された資料はありません</p>
        ) : (
          <ul className="space-y-1 p-3 text-sm">
            {karte.attachments.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                  {a.title}
                </a>
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                  {new Date(a.uploadedAt).toLocaleDateString("ja-JP")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Th({
  children,
  colSpan,
  rowSpan,
  className = "",
}: {
  children: React.ReactNode;
  colSpan?: number;
  rowSpan?: number;
  className?: string;
}) {
  return (
    <th
      colSpan={colSpan}
      rowSpan={rowSpan}
      className={`border border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-1 text-left align-middle font-medium whitespace-nowrap text-gray-600 dark:text-gray-300 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  colSpan,
  className = "",
}: {
  children: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td colSpan={colSpan} className={`border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 align-middle ${className}`}>
      {children}
    </td>
  );
}

// Boolean?項目の表示用（未登録はnull=—、それ以外はtrueLabel/falseLabel）。
// 既定は様式の「有/無」表記。ＤＩＤ区間・バス路線は「該当/非該当」表記のため
// yesNoLabelで個別に指定する。
function yesNo(v: boolean | null): string {
  return yesNoLabel(v, "有", "無");
}

function yesNoLabel(v: boolean | null, trueLabel: string, falseLabel: string): string {
  return v === null ? "—" : v ? trueLabel : falseLabel;
}
