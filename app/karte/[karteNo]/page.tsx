import { Fragment } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL, ROAD_TYPE_LABEL, WEATHER_LABEL, responseMeta, RESPONSE_META } from "@/lib/labels";
import PhotoSlot from "@/components/PhotoSlot";
import SheetTabs from "@/components/SheetTabs";
import FavoriteToggleButton from "@/components/FavoriteToggleButton";
import RecordViewHistory from "@/components/RecordViewHistory";

// 一覧画面と同じ理由で静的プリレンダリングを無効化する。
export const dynamic = "force-dynamic";

const PROJECT_CATEGORY_LABEL: Record<string, string> = { GENERAL: "一般", TOLL: "有料" };
const ROAD_STATUS_LABEL: Record<string, string> = { CURRENT: "現道", OLD: "旧道", NEW: "新道", NEWEST: "新新道" };
const GEODETIC_LABEL: Record<string, string> = { WORLD: "世界測地系", JAPAN: "日本測地系" };
// 対応区分は実際の様式では「①〜④のうち該当するものに○印」という4択形式。
// バッジ1つだけを表示するより、この4択の見た目を再現した方が様式に忠実なため、
// 選択中のものだけ丸で囲んで強調表示する（下部のRESPONSE_CHOICE参照）。
const RESPONSE_CHOICES: { value: string; no: string; label: string }[] = [
  { value: "COUNTERMEASURE_NEEDED", no: "①", label: "対策工が必要" },
  { value: "HANDLED_BY_KARTE", no: "②", label: "カルテ対応" },
  { value: "NO_COUNTERMEASURE_NEEDED", no: "③", label: "対策不要" },
  { value: "COUNTERMEASURE_COMPLETED", no: "④", label: "対策完了" },
];

// カルテ詳細画面。
// 「Excelとしてある防災カルテをWeb上で見るためのツール」という位置づけのため、
// 実際の防災カルテ様式Ａ・様式Ｂ・様式Ｃ・様式Ｄ（全国地質調査業協会連合会版）の
// 見た目・項目配置にできるだけ近づけて表示する（指示書9章の画面構成案よりも、実物の
// 様式への忠実さを優先している）。様式Ａの行・列の並びは、Excel取込機能の実装過程で
// 実データを精査して確認した実際のセル配置と一致させている
// （lib/excel/karte-import.ts参照）。
// 様式Ａ／様式Ｂ／様式Ｃ／様式Ｄ／カルテ資料は、Excelのシート切替を模したタブ
// （SheetTabs）で切り替える。様式Ｂ・様式Ｄは、実際のExcelでも点検対象・災害の件数
// ぶんシートが分かれるため、件数が複数ある場合はその中にさらにSheetTabsを入れ子で
// 使い、対象・災害ごとに切り替えられるようにしている。
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
        include: {
          photos: { orderBy: { takenAt: "asc" } },
          // 様式Ｄの「点検対象箇所」欄（実データで確認済み）に相当。どの変状で
          // 発生した災害かを示す。
          target: { select: { name: true, sequenceNo: true } },
        },
      },
      attachments: { orderBy: { uploadedAt: "desc" } },
      favorite: { select: { id: true } },
    },
  });

  if (!karte) notFound();

  const resultByTargetAndEvent = new Map<string, (typeof karte.events)[number]["results"][number]>();
  for (const ev of karte.events) {
    for (const r of ev.results) {
      resultByTargetAndEvent.set(`${r.targetId}:${ev.id}`, r);
    }
  }

  // ── 様式Ａ ─────────────────────────────────────────────
  const formA = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h1 className="text-base font-bold text-gray-800 dark:text-gray-100">
          防災カルテ様式Ａ　（{KARTE_TYPE_LABEL[karte.karteType] ?? karte.karteType}）
        </h1>
        <div className="text-right text-xs text-gray-600 dark:text-gray-300">
          <div>管理機関名: {karte.manageOrgName || "—"}</div>
          <div>管理機関コード: {karte.manageOrgCode || "—"}</div>
        </div>
      </div>

      <table className="w-full border-collapse text-xs">
        <tbody>
          {/* 実際のExcelの1行目（施設管理番号〜延長）と同じ並び */}
          <tr>
            <Th>施設管理番号</Th>
            <Td>{karte.facilityNo}</Td>
            <Th>カルテ区分</Th>
            <Td>{KARTE_TYPE_LABEL[karte.karteType] ?? karte.karteType}</Td>
            <Th>路線名</Th>
            <Td>{karte.routeName}</Td>
            <Th>台帳番号</Th>
            <Td>{karte.ledgerNo || "—"}</Td>
            <Th>距離標</Th>
            <Td>
              自 {karte.distanceMarkerFromKm?.toString() ?? "—"} km 〜 至 {karte.distanceMarkerToKm?.toString() ?? "—"} km
            </Td>
            <Th>上下線の別</Th>
            <Td>{karte.sideOfRoad || "—"}</Td>
            <Th>延長</Th>
            <Td>{karte.extensionLengthM ? `${karte.extensionLengthM} m` : "—"}</Td>
          </tr>
          {/* Excelの2行目（事業区分〜測地系） */}
          <tr>
            <Th>事業区分</Th>
            <Td>{karte.projectCategory ? PROJECT_CATEGORY_LABEL[karte.projectCategory] : "—"}</Td>
            <Th>道路種別</Th>
            <Td>{karte.roadType ? ROAD_TYPE_LABEL[karte.roadType] ?? karte.roadType : "—"}</Td>
            <Th>現道・旧道区分</Th>
            <Td>{karte.roadStatus ? ROAD_STATUS_LABEL[karte.roadStatus] : "—"}</Td>
            <Th>所在地</Th>
            <Td colSpan={3}>{[karte.locationDistrict, karte.locationTown].filter(Boolean).join(" ") || "—"}</Td>
            <Th>位置目印</Th>
            <Td colSpan={2}>{karte.landmark || "—"}</Td>
            <Th>北緯・東経</Th>
            <Td colSpan={2}>
              {karte.latitude && karte.longitude ? `${karte.latitude}, ${karte.longitude}` : "—"}
            </Td>
          </tr>
          <tr>
            <Th className="whitespace-normal">測地系</Th>
            <Td colSpan={13}>{karte.geodeticSystem ? GEODETIC_LABEL[karte.geodeticSystem] : "—"}</Td>
          </tr>
          {/* Excelの3行目（事前通行規制区間指定〜緊急輸送道路区分） */}
          <tr>
            <Th>事前通行規制区間指定</Th>
            <Td>{yesNo(karte.preTrafficRestriction)}</Td>
            <Th>交通量</Th>
            <Td colSpan={2}>
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
            <Th colSpan={2}>緊急輸送道路区分</Th>
            <Td colSpan={2}>{karte.emergencyRoadCategory || "—"}</Td>
          </tr>

          {/* 点検地点位置図・現況写真、専門技術者による点検（Excel上でも隣接） */}
          <tr>
            <Th rowSpan={1} className="align-top">
              点検地点位置図
              <br />
              現況写真
            </Th>
            <td colSpan={13} className="border border-gray-400 bg-white p-3 align-top dark:border-gray-600 dark:bg-gray-900">
              {karte.photos.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {karte.photos.map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.caption ?? undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={p.caption ?? "点検地点位置図"}
                        className="h-[28rem] w-[28rem] rounded border border-gray-300 object-cover dark:border-gray-700"
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="flex h-24 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                  写真なし（カルテ編集画面から追加できます）
                </p>
              )}
            </td>
          </tr>
          <tr>
            <Th>専門技術者による点検</Th>
            <Td colSpan={13}>
              {karte.specialistInspectionRequired === null ? "—" : karte.specialistInspectionRequired ? "有" : "無"}
            </Td>
          </tr>
          <tr>
            <Th className="align-top">着目すべき変状</Th>
            <td colSpan={6} className="border border-gray-400 bg-white p-2 align-top whitespace-pre-wrap dark:border-gray-600 dark:bg-gray-900">
              {karte.keyDeformationSummary || "—"}
            </td>
            <Th className="align-top">点検内容の要点</Th>
            <td colSpan={6} className="border border-gray-400 bg-white p-2 align-top whitespace-pre-wrap dark:border-gray-600 dark:bg-gray-900">
              {karte.inspectionContentSummary || "—"}
            </td>
          </tr>

          {/* 専門技術者のコメント／対応区分（○印）／評価年月日（Excel上でも同じ一帯） */}
          <tr>
            <Th className="align-top">専門技術者のコメント</Th>
            <td colSpan={13} className="border border-gray-400 bg-white p-2 align-top whitespace-pre-wrap dark:border-gray-600 dark:bg-gray-900">
              {karte.specialistComment || "—"}
            </td>
          </tr>
          <tr>
            <Th className="align-top">
              対応区分
              <br />
              <span className="font-normal text-gray-400 dark:text-gray-500">対応するものに○印</span>
            </Th>
            <td colSpan={11} className="border border-gray-400 bg-white p-2 align-top dark:border-gray-600 dark:bg-gray-900">
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {RESPONSE_CHOICES.map((c) => {
                  const selected = karte.responseCategory === c.value;
                  return (
                    <span
                      key={c.value}
                      className={
                        selected
                          ? "flex items-center gap-1 font-semibold text-gray-900 dark:text-gray-50"
                          : "flex items-center gap-1 text-gray-400 dark:text-gray-600"
                      }
                    >
                      {selected && (
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px]"
                          style={{ borderColor: responseMeta(karte.responseCategory).color, color: responseMeta(karte.responseCategory).color }}
                        >
                          ○
                        </span>
                      )}
                      {c.no}
                      {c.label}
                    </span>
                  );
                })}
              </div>
            </td>
            <Th>評価年月日</Th>
            <Td>
              {karte.responseEvaluatedAt ? new Date(karte.responseEvaluatedAt).toLocaleDateString("ja-JP") : "—"}
            </Td>
          </tr>

          {/* 着目すべき変状｜点検の時期｜想定される災害形態｜変状が出たときの対応（Excelの4列表） */}
          <tr>
            <Th colSpan={3}>着目すべき変状</Th>
            <Th colSpan={2}>点検の時期</Th>
            <Th colSpan={3}>想定される災害形態</Th>
            <Th colSpan={6}>変状が出たときの対応</Th>
          </tr>
          <tr>
            <td colSpan={3} className="border border-gray-400 bg-white p-2 align-top whitespace-pre-wrap dark:border-gray-600 dark:bg-gray-900">
              {karte.keyDeformationSummary || "—"}
            </td>
            <td colSpan={2} className="border border-gray-400 bg-white p-2 align-top dark:border-gray-600 dark:bg-gray-900">
              {karte.inspectionPeriodType === "REGULAR"
                ? "定期"
                : karte.inspectionPeriodType === "IRREGULAR"
                  ? "不定期"
                  : "—"}
              {karte.inspectionIntervalNote && (
                <div className="text-gray-500 dark:text-gray-400">{karte.inspectionIntervalNote}</div>
              )}
            </td>
            <td colSpan={3} className="border border-gray-400 bg-white p-2 align-top whitespace-pre-wrap dark:border-gray-600 dark:bg-gray-900">
              {karte.assumedDisasterForm || "—"}
            </td>
            <td colSpan={6} className="border border-gray-400 bg-white p-2 align-top whitespace-pre-wrap dark:border-gray-600 dark:bg-gray-900">
              {karte.responseWhenDeformed || "—"}
            </td>
          </tr>

          {/* 主な災害形態 */}
          {karte.rockfallDetail && (
            <tr>
              <Th colSpan={3}>主な災害形態</Th>
              <Td colSpan={11}>
                {[karte.rockfallDetail.mainFormRockfall && "落石", karte.rockfallDetail.mainFormCollapse && "崩壊"]
                  .filter(Boolean)
                  .join("・") || "—"}
              </Td>
            </tr>
          )}

          {/* 点検者名／専門技術者名（Excel上でもこの並び。会社名・連絡先は別セルで分ける） */}
          <tr>
            <Th>点検者名</Th>
            <Td colSpan={3}>{karte.inspectorName || "—"}</Td>
            <Th>会社名</Th>
            <Td colSpan={4}>{karte.inspectorCompany || "—"}</Td>
            <Th>連絡先</Th>
            <Td colSpan={4}>{karte.inspectorTel || "—"}</Td>
          </tr>
          <tr>
            <Th>作成年月日</Th>
            <Td colSpan={2}>
              {karte.createdOnSiteDate ? new Date(karte.createdOnSiteDate).toLocaleDateString("ja-JP") : "—"}
            </Td>
            <Th>天候</Th>
            <Td colSpan={2}>{karte.createdOnSiteWeather ? WEATHER_LABEL[karte.createdOnSiteWeather] : "—"}</Td>
            <Th>専門技術者名</Th>
            <Td colSpan={2}>{karte.specialistName || "—"}</Td>
            <Th>会社名</Th>
            <Td colSpan={2}>{karte.specialistCompany || "—"}</Td>
            <Th>連絡先</Th>
            <Td colSpan={2}>{karte.specialistTel || "—"}</Td>
          </tr>
        </tbody>
      </table>
    </section>
  );

  // ── 様式Ｂ（変状/点検対象ごとの詳細記録） ───────────────────────────
  // 実際のExcelでは点検対象（変状）ごとに様式Ｂのシートが分かれる（例:"様式Ｂ (1)"
  // "様式Ｂ(2)"）。1つのシート＝1つの点検対象なので、複数ある場合は様式Ａ／様式Ｂ／
  // 様式Ｃと同じSheetTabsを入れ子にして、対象ごとにタブで切り替える（以前は全対象を
  // 縦に並べて表示していたが、対象数が増えるほど「様式Ｂの要素が大きすぎる」状態に
  // なっていたため）。
  // レイアウトは点検対象編集画面（様式Ｂの編集版）と同じで、実データでdrawingの
  // アンカー位置まで確認済み: 左に<詳細スケッチ欄>（写真2枚縦並び）、右に
  // <写真張付欄>（大きめの写真1枚）とその下に着目すべき点・チェック項目。
  const formB = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">
          防災カルテ様式Ｂ　（{KARTE_TYPE_LABEL[karte.karteType] ?? karte.karteType}）
        </h2>
      </div>
      {karte.targets.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">点検対象が登録されていません</p>
      ) : (
        <SheetTabs
          tabs={karte.targets.map((t) => {
            const [sketchPhoto1, sketchPhoto2, pastePhoto] = t.photos;
            const targetCode = `${karte.facilityNo}-T${String(t.sequenceNo).padStart(2, "0")}`;
            return {
              id: t.id,
              label: `${circledNumber(t.sequenceNo)} ${t.name}${t.isActive ? "" : "（解消済み）"}`,
              content: (
                <div>
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      <tr>
                        <Th>施設管理番号</Th>
                        <Td>{karte.facilityNo}</Td>
                        <Th>路線名</Th>
                        <Td>{karte.routeName}</Td>
                        <Th>変状 No.</Th>
                        <Td colSpan={3}>
                          {targetCode} {t.name}
                          {!t.isActive && <span className="ml-2 text-gray-500 dark:text-gray-400">（解消済み）</span>}
                          <Link
                            href={`/karte/${karte.facilityNo}/targets/${t.id}/edit`}
                            className="ml-3 font-normal text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            編集
                          </Link>
                        </Td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="grid grid-cols-1 divide-y divide-gray-400 border-t border-gray-400 dark:divide-gray-600 dark:border-gray-600 md:grid-cols-2 md:divide-x md:divide-y-0">
                    {/* 左: <詳細スケッチ欄>（実データでは写真2枚が縦に並ぶ） */}
                    <div className="p-3">
                      <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">&lt;詳細スケッチ欄&gt;</h3>
                      <div className="space-y-3">
                        <PhotoSlot photo={sketchPhoto1} heightClass="h-56" fit="contain" />
                        <PhotoSlot photo={sketchPhoto2} heightClass="h-56" fit="contain" />
                      </div>
                    </div>
                    {/* 右: <写真張付欄>（実データでは大きめの写真1枚）＋着目すべき点／チェック項目 */}
                    <div className="space-y-3 p-3 text-sm">
                      <div>
                        <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">&lt;写真張付欄&gt;</h3>
                        <PhotoSlot photo={pastePhoto} heightClass="h-[29rem]" />
                      </div>
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">着目すべき点</h3>
                        <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">{t.keyPoints || "—"}</p>
                      </div>
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">チェック項目</h3>
                        <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">{t.checkItems || "—"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">作成年月日</h3>
                          <p className="text-gray-800 dark:text-gray-100">
                            {t.createdOnSiteDate ? new Date(t.createdOnSiteDate).toLocaleDateString("ja-JP") : "—"}
                          </p>
                        </div>
                        <div>
                          <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">天候</h3>
                          <p className="text-gray-800 dark:text-gray-100">
                            {t.createdOnSiteWeather ? WEATHER_LABEL[t.createdOnSiteWeather] : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ),
            };
          })}
        />
      )}
    </section>
  );

  // ── 様式Ｃ（点検履歴） ─────────────────────────────────────
  const formC = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
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
        // table-fixed＋各セルの明示的な幅で列幅を揃える（既定のauto layoutだと、
        // 「点検時の特記事項」等セル内の文章量に引っ張られて点検日ごとの列幅が
        // ばらばらになってしまっていたため）。幅を固定する分、はみ出す文章は
        // 横に伸ばさず縦に折り返す（各セルのwhitespace-pre-wrap指定はそのまま活かす）。
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr>
              <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">点検年月日</Th>
              {karte.events.map((ev) => (
                <Th key={ev.id} className="w-40">
                  {new Date(ev.inspectionDate).toLocaleDateString("ja-JP")}
                </Th>
              ))}
            </tr>
            <tr>
              <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">点検者名</Th>
              {karte.events.map((ev) => (
                <Td key={ev.id}>{ev.inspectorName || "—"}</Td>
              ))}
            </tr>
            <tr>
              <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">天候</Th>
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
                    className={`border border-gray-400 bg-gray-50 px-2 py-1 font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 ${
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
                  <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">前回との差異</Th>
                  {karte.events.map((ev) => {
                    const r = resultByTargetAndEvent.get(`${t.id}:${ev.id}`);
                    return <Td key={ev.id}>{r ? (r.diffFromPrevious ? "有" : "無") : "—"}</Td>;
                  })}
                </tr>
                <tr key={`${t.id}-disaster`}>
                  <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">被災履歴</Th>
                  {karte.events.map((ev) => {
                    const r = resultByTargetAndEvent.get(`${t.id}:${ev.id}`);
                    return <Td key={ev.id}>{r ? (r.disasterHistory ? "有" : "無") : "—"}</Td>;
                  })}
                </tr>
                <tr key={`${t.id}-repair`}>
                  <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">補修履歴</Th>
                  {karte.events.map((ev) => {
                    const r = resultByTargetAndEvent.get(`${t.id}:${ev.id}`);
                    return <Td key={ev.id}>{r ? (r.repairHistory ? "有" : "無") : "—"}</Td>;
                  })}
                </tr>
                <tr key={`${t.id}-comment`}>
                  <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">コメント</Th>
                  {karte.events.map((ev) => {
                    const r = resultByTargetAndEvent.get(`${t.id}:${ev.id}`);
                    return (
                      <Td key={ev.id} className="whitespace-pre-wrap">
                        {r?.comment || "—"}
                      </Td>
                    );
                  })}
                </tr>
              </Fragment>
            ))}

            <tr>
              <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">点検後の対応（専門技術者の判定）</Th>
              {karte.events.map((ev) => (
                <Td key={ev.id}>{ev.specialistJudgement ? RESPONSE_META[ev.specialistJudgement]?.label : "—"}</Td>
              ))}
            </tr>
            <tr>
              <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">専門技術者による点検年月日</Th>
              {karte.events.map((ev) => (
                <Td key={ev.id}>
                  {ev.specialistInspectionDate
                    ? new Date(ev.specialistInspectionDate).toLocaleDateString("ja-JP")
                    : "—"}
                </Td>
              ))}
            </tr>
            <tr>
              <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">専門技術者名</Th>
              {karte.events.map((ev) => (
                <Td key={ev.id}>{ev.specialistName || "—"}</Td>
              ))}
            </tr>
            <tr>
              <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">次回点検実施時期</Th>
              {karte.events.map((ev) => (
                <Td key={ev.id}>{ev.nextInspectionDueYear ? `${ev.nextInspectionDueYear}年度` : "—"}</Td>
              ))}
            </tr>
            <tr>
              <Th className="sticky left-0 w-40 whitespace-normal bg-gray-100 dark:bg-gray-700">点検時の特記事項</Th>
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
  );

  // ── 様式Ｄ（災害履歴） ─────────────────────────────────────
  // 実データ（08_B1432A020）でセル配置を確認済み: 上段は様式Ａと同じカルテ共通情報
  // （施設管理番号・路線名・台帳番号・距離標・上下線／事業区分・道路種別・現道旧道
  // 区分・所在地・緯度経度・測地系。値はDisasterEvent固有ではなくKarte側の値を
  // そのまま再掲する）＋点検対象箇所（対象の変状No.・名称）。
  // 中段は左に<平面図（被災・対策）><現況写真・スケッチ（被災・対策）>の2枠を縦に、
  // 右に<断面図（被災・対策）>1枠とその下に特記事項（発生年月日・規模・誘因・被害・
  // 通行止実績・対策工、各コメント欄付き）。下段は様式Ａ・様式Ｂと同じ作成年月日／天候。
  // 3枚の画像は様式Ｂと同じ「先頭N枚を固定配置に当てはめる」方式にしているが、
  // 様式Ｂと異なりdrawingのアンカー位置までは未確認のため、平面図→断面図→
  // 現況写真・スケッチの割当順は様式の並び順からの推測（要検証）。
  // 実際のExcelでも災害ごとにブロックが分かれる（1件の被災・対策実績＝1ブロック）ため、
  // 複数件ある場合は様式Ｂと同じくSheetTabsを入れ子にして切り替える。
  const formD = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">
          防災カルテ様式Ｄ　（{KARTE_TYPE_LABEL[karte.karteType] ?? karte.karteType}）
        </h2>
      </div>
      {karte.disasterEvents.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">記録された災害履歴はありません</p>
      ) : (
        <SheetTabs
          tabs={karte.disasterEvents.map((d, i) => {
            const [planPhoto, sectionPhoto, sitePhoto] = d.photos;
            const dateLabel = d.occurredDate ? new Date(d.occurredDate).toLocaleDateString("ja-JP") : "発生日未登録";
            return {
              id: d.id,
              label: `${circledNumber(i + 1)} ${dateLabel}`,
              content: (
                <div>
                  <table className="w-full table-fixed border-collapse text-xs">
                    <tbody>
                      <tr>
                        <Th className="w-32">施設管理番号</Th>
                        <Td>{karte.facilityNo}</Td>
                        <Th className="w-24">災害種別</Th>
                        <Td>{d.disasterType ? KARTE_TYPE_LABEL[d.disasterType] ?? d.disasterType : "—"}</Td>
                        <Th className="w-24">路線名</Th>
                        <Td>{karte.routeName}</Td>
                        <Th className="w-24">台帳番号</Th>
                        <Td>{karte.ledgerNo || "—"}</Td>
                      </tr>
                      <tr>
                        <Th>点検対象箇所</Th>
                        <Td>{d.target ? `${circledNumber(d.target.sequenceNo)} ${d.target.name}` : "—"}</Td>
                        <Th>事業区分</Th>
                        <Td>{karte.projectCategory ? PROJECT_CATEGORY_LABEL[karte.projectCategory] : "—"}</Td>
                        <Th>道路種別</Th>
                        <Td>{karte.roadType ? ROAD_TYPE_LABEL[karte.roadType] ?? karte.roadType : "—"}</Td>
                        <Th>現道・旧道区分</Th>
                        <Td>{karte.roadStatus ? ROAD_STATUS_LABEL[karte.roadStatus] : "—"}</Td>
                      </tr>
                      <tr>
                        <Th>所在地</Th>
                        <Td colSpan={3}>{[karte.locationDistrict, karte.locationTown].filter(Boolean).join(" ") || "—"}</Td>
                        <Th>北緯・東経</Th>
                        <Td colSpan={3}>
                          {karte.latitude && karte.longitude ? `${karte.latitude}, ${karte.longitude}` : "—"}
                          {karte.geodeticSystem ? `（${GEODETIC_LABEL[karte.geodeticSystem]}）` : ""}
                        </Td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="grid grid-cols-1 divide-y divide-gray-400 border-t border-gray-400 dark:divide-gray-600 dark:border-gray-600 md:grid-cols-2 md:divide-x md:divide-y-0">
                    {/* 左: 平面図・現況写真スケッチ（いずれも被災・対策の様子） */}
                    <div className="space-y-3 p-3">
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                          &lt;平面図（被災・対策）&gt;
                        </h3>
                        <PhotoSlot photo={planPhoto} heightClass="h-48" fit="contain" />
                      </div>
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                          &lt;現況写真・スケッチ（被災・対策）&gt;
                        </h3>
                        <PhotoSlot photo={sitePhoto} heightClass="h-48" fit="contain" />
                      </div>
                    </div>

                    {/* 右: 断面図＋特記事項（発生年月日・規模・誘因・被害・通行止実績・対策工） */}
                    <div className="space-y-3 p-3 text-xs">
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                          &lt;断面図（被災・対策）&gt;
                        </h3>
                        <PhotoSlot photo={sectionPhoto} heightClass="h-48" fit="contain" />
                      </div>

                      <table className="w-full table-fixed border-collapse">
                        <tbody>
                          <tr>
                            <Th className="w-24">発生年月日</Th>
                            <Td>{dateLabel}</Td>
                          </tr>
                          <tr>
                            <Th>規　模</Th>
                            <Td>
                              幅 {d.scaleWidthM?.toString() ?? "—"} m ／ 長さ {d.scaleLengthM?.toString() ?? "—"} m ／
                              深さ {d.scaleDepthM?.toString() ?? "—"} m
                              {d.scaleComment && (
                                <p className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-300">
                                  コメント: {d.scaleComment}
                                </p>
                              )}
                            </Td>
                          </tr>
                          <tr>
                            <Th>誘　因</Th>
                            <Td className="whitespace-pre-wrap">
                              {[
                                d.rainContinuousMm != null && `降雨：連続 ${d.rainContinuousMm}mm`,
                                d.rainMaxHourlyMm != null && `最大 ${d.rainMaxHourlyMm}mm/hr`,
                                d.seismicIntensity && `地震：震度 ${d.seismicIntensity}`,
                                d.seismicAccelerationGal != null && `加速度 ${d.seismicAccelerationGal}gal`,
                                d.snowTemperatureC != null && `雪崩：気温 ${d.snowTemperatureC}℃`,
                                d.snowDepthM != null && `積雪深 ${d.snowDepthM}m`,
                              ]
                                .filter(Boolean)
                                .join(" ／ ") || "—"}
                              {d.causeComment && (
                                <p className="mt-1 text-gray-600 dark:text-gray-300">コメント: {d.causeComment}</p>
                              )}
                            </Td>
                          </tr>
                          <tr>
                            <Th>被　害</Th>
                            <Td>
                              人身：死者 {d.damageDeaths ?? 0}人、負傷者 {d.damageInjured ?? 0}人
                              {d.propertyDamageAmountMillionYen != null &&
                                ` ／ 被害額 ${d.propertyDamageAmountMillionYen}百万円`}
                              {d.propertyDamageComment && (
                                <p className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-300">
                                  コメント: {d.propertyDamageComment}
                                </p>
                              )}
                            </Td>
                          </tr>
                          <tr>
                            <Th>通行止実績</Th>
                            <Td>
                              全面 {d.closureFullHours?.toString() ?? 0}時間、片側 {d.closurePartialHours?.toString() ?? 0}
                              時間{d.shoulderRestriction ? "、路肩規制あり" : ""}
                            </Td>
                          </tr>
                          <tr>
                            <Th>対策工</Th>
                            <Td>
                              {d.countermeasureFiscalYear ? `施工年度 ${d.countermeasureFiscalYear}年度` : "施工年度 —"}
                              {d.countermeasureType ? ` ／ 対策工種 ${d.countermeasureType}` : ""}
                              {d.countermeasureCostMillionYen != null
                                ? ` ／ 概算工費 ${d.countermeasureCostMillionYen}百万円`
                                : ""}
                              {d.comment && (
                                <p className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-300">
                                  コメント: {d.comment}
                                </p>
                              )}
                            </Td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <table className="w-full table-fixed border-collapse text-xs">
                    <tbody>
                      <tr>
                        <Th className="w-24">作成年月日</Th>
                        <Td>{d.createdOnSiteDate ? new Date(d.createdOnSiteDate).toLocaleDateString("ja-JP") : "—"}</Td>
                        <Th className="w-16">天候</Th>
                        <Td>{d.createdOnSiteWeather ? WEATHER_LABEL[d.createdOnSiteWeather] : "—"}</Td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ),
            };
          })}
        />
      )}
    </section>
  );

  // ── カルテ資料 ─────────────────────────────────────────
  const documents = (
    <section className="rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
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
  );

  return (
    // 様式Ａ・様式Ｃ等はExcelを模した横に広い表になるため、他ページより広い上限にする
    // （検索・一覧やフォーム主体の画面は要素が少なく、広げるとかえって間延びするため
    // ページごとに幅を決めている。app/layout.tsxのコメント参照）。
    <div className="mx-auto max-w-[1800px] space-y-6 p-6">
      {/* 閲覧履歴（ヘッダーの🕘閲覧履歴ボタン）に記録するだけの非表示コンポーネント */}
      <RecordViewHistory facilityNo={karte.facilityNo} routeName={karte.routeName} />
      <div className="flex items-center justify-between">
        <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          ← 検索・一覧に戻る
        </Link>
        <div className="flex items-center gap-2">
          <FavoriteToggleButton
            karteId={karte.id}
            karteFacilityNo={karte.facilityNo}
            initialIsFavorite={karte.favorite != null}
          />
          <Link
            href={`/karte/${karte.facilityNo}/edit`}
            className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            カルテを編集
          </Link>
        </div>
      </div>

      <SheetTabs
        tabs={[
          { id: "formA", label: "様式Ａ", content: formA },
          { id: "formB", label: "様式Ｂ", content: formB },
          { id: "formC", label: "様式Ｃ", content: formC },
          { id: "formD", label: "様式Ｄ", content: formD },
          { id: "documents", label: "カルテ資料", content: documents },
        ]}
      />
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
    <td
      colSpan={colSpan}
      className={`border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 align-middle whitespace-nowrap ${className}`}
    >
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

// 様式Ｂ・様式Ｄの入れ子タブのラベル用。実際の様式の「変状No.」表記（①②③…）に
// 合わせる（lib/excel/karte-import.tsのCIRCLED_NUMBERSは逆方向＝丸数字→数値の
// マッピングのため、表示用の順方向はこちらに持つ）。範囲外の番号はそのまま数値で表示する。
const CIRCLED_NUMBER_LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
function circledNumber(n: number): string {
  return CIRCLED_NUMBER_LABELS[n - 1] ?? `No.${n}`;
}
