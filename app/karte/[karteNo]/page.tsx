import { Fragment } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KARTE_TYPE_LABEL, ROAD_TYPE_LABEL, WEATHER_LABEL, responseMeta, RESPONSE_META } from "@/lib/labels";
import { seqToCircledNumber } from "@/lib/excel/karte-import";
import PhotoSlot from "@/components/PhotoSlot";
import { PhotoLightboxGroup, PhotoLightboxThumbnail } from "@/components/PhotoLightbox";
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

  // karte.photos（カルテ本体に紐づく写真＝targetId/eventId/disasterEventIdが全てnull）は、
  // 様式Ａの「点検地点位置図・現況写真」（sourceForm: FORM_A・OTHER）と、
  // 「現状記録写真」シート由来の写真（sourceForm: GENERAL_RECORD）の両方を含むため、
  // 表示先に応じてここで振り分ける。
  const formAPhotos = karte.photos.filter((p) => p.sourceForm !== "GENERAL_RECORD");
  const recordPhotos = karte.photos.filter((p) => p.sourceForm === "GENERAL_RECORD");

  // ── カルテ共通ヘッダー（様式Ａ／Ｂ／Ｃを切り替えても常に上に表示） ─────────────
  // 元々は様式Ａの表の一部（1〜4行目）だったが、「様式Ａ・Ｂ・Ｃを切り替えても
  // 施設管理番号等の基本情報が常に見えるようにしてほしい」という要望を受けて、
  // SheetTabsの外（＝タブ切替の影響を受けない場所）に独立させた。様式Ｄは元々
  // 自分のタブ内に同じ情報を再掲する作り（実際のExcelでも様式Ｄは別シートとして
  // 同じヘッダーを持つ）のため、そちらは変更していない。
  // 規制基準等（連続雨量・時間雨量）は、以前はどの画面にも表示していなかった項目
  // （データはKarte.continuousRainfallMm／hourlyRainfallMmとして保存済みだったが
  // 表示側が未実装だった）ため、このタイミングで追加している。
  // 表（<table>）だとExcelそのままの横幅になり、実際に横スクロールバーが出て
  // 読みにくいという指摘を受けたため、常時表示のこのヘッダーだけは折り返し可能な
  // flex-wrapの「ラベル：値」の並びにしている（様式Ａ〜Ｄ自体はExcel再現を優先して
  // 横スクロール可の表のままだが、常時表示するここは可読性を優先。入り切らなければ
  // 自然に何行にでも折り返す＝横スクロールは発生しない）。
  const commonHeader = (
    <section className="rounded border border-gray-400 bg-white px-3 py-1.5 dark:border-gray-600 dark:bg-gray-900">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] leading-5">
        <HeaderItem label="管理機関名">{karte.manageOrgName || "—"}</HeaderItem>
        <HeaderItem label="管理機関コード">{karte.manageOrgCode || "—"}</HeaderItem>
        <HeaderItem label="施設管理番号">{karte.facilityNo}</HeaderItem>
        <HeaderItem label="災害区分">{KARTE_TYPE_LABEL[karte.karteType] ?? karte.karteType}</HeaderItem>
        <HeaderItem label="路線名">{karte.routeName}</HeaderItem>
        <HeaderItem label="台帳番号">{karte.ledgerNo || "—"}</HeaderItem>
        <HeaderItem label="距離標">
          自 {karte.distanceMarkerFromKm?.toString() ?? "—"} km 〜 至 {karte.distanceMarkerToKm?.toString() ?? "—"} km
        </HeaderItem>
        <HeaderItem label="上下線の別">{karte.sideOfRoad || "—"}</HeaderItem>
        <HeaderItem label="延長">{karte.extensionLengthM ? `${karte.extensionLengthM} m` : "—"}</HeaderItem>
        <HeaderItem label="事業区分">{karte.projectCategory ? PROJECT_CATEGORY_LABEL[karte.projectCategory] : "—"}</HeaderItem>
        <HeaderItem label="道路種別">{karte.roadType ? ROAD_TYPE_LABEL[karte.roadType] ?? karte.roadType : "—"}</HeaderItem>
        <HeaderItem label="現道・旧道区分">{karte.roadStatus ? ROAD_STATUS_LABEL[karte.roadStatus] : "—"}</HeaderItem>
        <HeaderItem label="所在地">{[karte.locationDistrict, karte.locationTown].filter(Boolean).join(" ") || "—"}</HeaderItem>
        <HeaderItem label="北緯・東経">
          {karte.latitude && karte.longitude ? `${karte.latitude}, ${karte.longitude}` : "—"}
        </HeaderItem>
        <HeaderItem label="測地系">{karte.geodeticSystem ? GEODETIC_LABEL[karte.geodeticSystem] : "—"}</HeaderItem>
        <HeaderItem label="事前通行規制区間指定">{yesNo(karte.preTrafficRestriction)}</HeaderItem>
        <HeaderItem label="規制基準等">
          {karte.continuousRainfallMm != null || karte.hourlyRainfallMm != null
            ? `連続雨量 ${karte.continuousRainfallMm ?? "—"}mm ／ 時間雨量 ${karte.hourlyRainfallMm ?? "—"}mm`
            : "—"}
        </HeaderItem>
        <HeaderItem label="交通量">
          {karte.trafficVolumeWeekday != null
            ? `平日 ${karte.trafficVolumeWeekday} 台/12h`
            : karte.trafficVolumeHoliday != null
              ? `休日 ${karte.trafficVolumeHoliday} 台/12h`
              : "—"}
        </HeaderItem>
        <HeaderItem label="センサス">
          {karte.trafficCensusYear || karte.trafficCensusPointCode
            ? [karte.trafficCensusYear, karte.trafficCensusPointCode].filter(Boolean).join(" ")
            : "—"}
        </HeaderItem>
        <HeaderItem label="ＤＩＤ区間">{yesNoLabel(karte.didArea, "該当", "非該当")}</HeaderItem>
        <HeaderItem label="バス路線">{yesNoLabel(karte.busRoute, "該当", "非該当")}</HeaderItem>
        <HeaderItem label="迂回路">{yesNo(karte.detour)}</HeaderItem>
        <HeaderItem label="緊急輸送道路区分">{karte.emergencyRoadCategory || "—"}</HeaderItem>
      </div>
    </section>
  );

  // ── 様式Ａ ─────────────────────────────────────────────
  const formA = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      {/* 管理機関名・管理機関コードは常時表示のcommonHeaderに移したため、ここでは
          見出しのみ（重複させない）。 */}
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h1 className="text-base font-bold text-gray-800 dark:text-gray-100">
          防災カルテ様式Ａ　（{KARTE_TYPE_LABEL[karte.karteType] ?? karte.karteType}）
        </h1>
      </div>

      <table className="w-full border-collapse text-xs">
        <tbody>
          {/* 位置目印は共通ヘッダーには含めていない（施設管理番号等と違い様式Ａ固有の
              自由記述項目という位置づけのため）。 */}
          <tr>
            <Th>位置目印</Th>
            <Td colSpan={13}>{karte.landmark || "—"}</Td>
          </tr>

          {/* 点検地点位置図・現況写真、専門技術者による点検（Excel上でも隣接） */}
          <tr>
            <Th rowSpan={1} className="align-top">
              点検地点位置図
              <br />
              現況写真
            </Th>
            <td colSpan={13} className="border border-gray-400 bg-white p-3 align-top dark:border-gray-600 dark:bg-gray-900">
              {formAPhotos.length > 0 ? (
                <PhotoLightboxGroup photos={formAPhotos}>
                  <div className="flex flex-wrap gap-3">
                    {formAPhotos.map((p, i) => (
                      <PhotoLightboxThumbnail key={p.id} index={i} className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={p.caption ?? "点検地点位置図"}
                          title={p.caption ?? undefined}
                          className="h-[28rem] w-[28rem] cursor-zoom-in rounded border border-gray-300 object-cover dark:border-gray-700"
                        />
                      </PhotoLightboxThumbnail>
                    ))}
                  </div>
                </PhotoLightboxGroup>
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

          {/* 作成年月日・天候はどちらの点検者にも属さない共通項目のため、独立した行にしている
              （以前は専門技術者名の行に同居させていたため、点検者名／専門技術者名の
              各列の位置がずれて見える問題があった）。 */}
          <tr>
            <Th>作成年月日</Th>
            <Td colSpan={6}>
              {karte.createdOnSiteDate ? new Date(karte.createdOnSiteDate).toLocaleDateString("ja-JP") : "—"}
            </Td>
            <Th>天候</Th>
            <Td colSpan={6}>{karte.createdOnSiteWeather ? WEATHER_LABEL[karte.createdOnSiteWeather] : "—"}</Td>
          </tr>
          {/* 点検者名／専門技術者名は同じ列構成（Th1＋Td3＋Th1＋Td4＋Th1＋Td4）にして、
              名前・会社名・連絡先が縦に揃って見えるようにしている。 */}
          <tr>
            <Th>点検者名</Th>
            <Td colSpan={3}>{karte.inspectorName || "—"}</Td>
            <Th>会社名</Th>
            <Td colSpan={4}>{karte.inspectorCompany || "—"}</Td>
            <Th>連絡先</Th>
            <Td colSpan={4}>{karte.inspectorTel || "—"}</Td>
          </tr>
          <tr>
            <Th>専門技術者名</Th>
            <Td colSpan={3}>{karte.specialistName || "—"}</Td>
            <Th>会社名</Th>
            <Td colSpan={4}>{karte.specialistCompany || "—"}</Td>
            <Th>連絡先</Th>
            <Td colSpan={4}>{karte.specialistTel || "—"}</Td>
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
              label: `${seqToCircledNumber(t.sequenceNo)} ${t.name}${t.isActive ? "" : "（解消済み）"}`,
              content: (
                <div>
                  {/* 施設管理番号・路線名は常時表示のcommonHeader（様式Ａ〜Ｄ共通）に既に
                      出ているため、様式Ｂタブ内では重複させない。ここには様式Ｂにしか
                      無い項目（変状No.・編集リンク）だけを残す。 */}
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      <tr>
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
                      {/* 「様式Ｂの写真が大きすぎる」という指摘を受け、既定サイズ（列幅いっぱい）の
                          2/3程度に縮小している（w-2/3。aspect-videoで縦横比は保ったまま）。 */}
                      <div className="mx-auto w-2/3 space-y-3">
                        <PhotoSlot photo={sketchPhoto1} />
                        <PhotoSlot photo={sketchPhoto2} />
                      </div>
                    </div>
                    {/* 右: <写真張付欄>（実データでは大きめの写真1枚）＋着目すべき点／チェック項目 */}
                    <div className="space-y-3 p-3 text-sm">
                      <div>
                        <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">&lt;写真張付欄&gt;</h3>
                        <div className="mx-auto w-2/3">
                          <PhotoSlot photo={pastePhoto} />
                        </div>
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
  // 実データ（08_B1432A020）でセル配置を確認済み: 実際のExcelでは上段に様式Ａと同じ
  // カルテ共通情報（施設管理番号・路線名・台帳番号・距離標・上下線／事業区分・道路種別・
  // 現道旧道区分・所在地・緯度経度・測地系）を再掲する作りだが、Web版では「様式Ａ〜Ｄの
  // どのタブでも同じ基本情報を表示してほしい」という要望に合わせ、これらは常時表示の
  // commonHeaderに一本化し、様式Ｄタブ内では重複させていない。様式Ｄタブに残すのは、
  // 他のタブに無い項目である点検対象箇所（対象の変状No.・名称）・災害種別のみ。
  // 中段は左に<平面図（被災・対策）><現況写真・スケッチ（被災・対策）>の2枠を縦に、
  // 右に<断面図（被災・対策）>1枠とその下に特記事項（発生年月日・規模・誘因・被害・
  // 通行止実績・対策工、各コメント欄付き）。下段は様式Ａ・様式Ｂと同じ作成年月日／天候。
  // 3枚の画像は様式Ｂと同じ「先頭N枚を固定配置に当てはめる」方式にしているが、
  // 様式Ｂと異なりdrawingのアンカー位置までは未確認のため、平面図→断面図→
  // 現況写真・スケッチの割当順は様式の並び順からの推測（要検証）。
  // 実際のExcelでも災害ごとにブロックが分かれる（1件の被災・対策実績＝1ブロック）ため、
  // 複数件ある場合は様式Ｂと同じくSheetTabsを入れ子にして切り替える。
  //
  // 災害履歴が1件も無い場合でも、様式Ａ同様「まだ何も無いこと」より「様式のレイアウト
  // 自体」を見せる方針にしている（実際のExcelも、被災実績が無いカルテでは空欄のまま
  // 様式Ｄのシート自体は存在する）。そのため0件のときは「記録なし」メッセージだけを
  // 出すのではなく、全項目が空欄（—・写真なし）のブランクな1件分として同じレイアウトを
  // そのまま表示する。
  const disasterEventsForDisplay: (typeof karte.disasterEvents)[number][] =
    karte.disasterEvents.length > 0
      ? karte.disasterEvents
      : [
          {
            id: "__blank__",
            karteId: karte.id,
            targetId: null,
            disasterType: null,
            occurredDate: null,
            scaleWidthM: null,
            scaleLengthM: null,
            scaleDepthM: null,
            scaleComment: null,
            rainContinuousMm: null,
            rainMaxHourlyMm: null,
            seismicIntensity: null,
            seismicAccelerationGal: null,
            snowTemperatureC: null,
            snowDepthM: null,
            causeComment: null,
            damageDeaths: null,
            damageInjured: null,
            propertyDamageComment: null,
            propertyDamageAmountMillionYen: null,
            closureFullHours: null,
            closurePartialHours: null,
            shoulderRestriction: null,
            countermeasureFiscalYear: null,
            countermeasureType: null,
            countermeasureCostMillionYen: null,
            comment: null,
            createdOnSiteDate: null,
            createdOnSiteWeather: null,
            createdAt: new Date(0),
            photos: [],
            target: null,
          },
        ];
  const formD = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">
          防災カルテ様式Ｄ　（{KARTE_TYPE_LABEL[karte.karteType] ?? karte.karteType}）
        </h2>
      </div>
      <SheetTabs
        tabs={disasterEventsForDisplay.map((d, i) => {
            const [planPhoto, sectionPhoto, sitePhoto] = d.photos;
            const dateLabel = d.occurredDate ? new Date(d.occurredDate).toLocaleDateString("ja-JP") : "発生日未登録";
            return {
              id: d.id,
              label: `${seqToCircledNumber(i + 1)} ${dateLabel}`,
              content: (
                <div>
                  {/* 施設管理番号・路線名・台帳番号・事業区分・道路種別・現道旧道区分・所在地・
                      北緯東経・測地系は、常時表示のcommonHeader（様式Ａ〜Ｄ共通）に既に
                      出ているため、様式Ｄタブ内では重複させない。ここには様式Ｄにしか
                      無い項目（点検対象箇所・災害種別）だけを残す。 */}
                  <table className="w-full table-fixed border-collapse text-xs">
                    <tbody>
                      <tr>
                        <Th className="w-32">点検対象箇所</Th>
                        <Td>{d.target ? `${seqToCircledNumber(d.target.sequenceNo)} ${d.target.name}` : "—"}</Td>
                        <Th className="w-24">災害種別</Th>
                        <Td>{d.disasterType ? KARTE_TYPE_LABEL[d.disasterType] ?? d.disasterType : "—"}</Td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="grid grid-cols-1 divide-y divide-gray-400 border-t border-gray-400 dark:divide-gray-600 dark:border-gray-600 md:grid-cols-2 md:divide-x md:divide-y-0">
                    {/* 左: 平面図・現況写真スケッチ（いずれも被災・対策の様子）。
                        写真の大きさは様式Ｂ（<詳細スケッチ欄>）と同じ基準に揃えている
                        （w-2/3。aspect-videoで縦横比は保ったまま既定サイズの2/3程度に縮小）。 */}
                    <div className="space-y-3 p-3">
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                          &lt;平面図（被災・対策）&gt;
                        </h3>
                        <div className="mx-auto w-2/3">
                          <PhotoSlot photo={planPhoto} />
                        </div>
                      </div>
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                          &lt;現況写真・スケッチ（被災・対策）&gt;
                        </h3>
                        <div className="mx-auto w-2/3">
                          <PhotoSlot photo={sitePhoto} />
                        </div>
                      </div>
                    </div>

                    {/* 右: 断面図＋特記事項（発生年月日・規模・誘因・被害・通行止実績・対策工）。
                        文字サイズも様式Ｂの右列（<写真張付欄>・着目すべき点等）と同じtext-smに
                        揃えている（従来text-xsで様式Ｂより一回り小さかった）。 */}
                    <div className="space-y-3 p-3 text-sm">
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                          &lt;断面図（被災・対策）&gt;
                        </h3>
                        <div className="mx-auto w-2/3">
                          <PhotoSlot photo={sectionPhoto} />
                        </div>
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
    </section>
  );

  // ── 現状記録写真 ────────────────────────────────────────
  // 様式Ａ・様式Ｂに収まらなかった写真をまとめる別シート。実データで「現状記録写真」
  // 「R7現状記録写真」（年度は毎年変わる）という名前で、写真が多いカルテでは様式Ｂと
  // 同様に連番シート「〜写真 (2)」「〜写真 (3)」に分かれることを確認済み
  // （lib/excel/karte-import.tsのfindRecordPhotoSheetNames参照）。
  // 各写真の下にある結合セルのキャプション（Excel上の「起点側全景」等の文字列。
  // G23・AY23・G41・AY41の固定位置）も取り込んでおり、写真の下に表示する
  // （lib/excel/karte-import.tsのextractRecordPhotoCaptions参照）。
  // 元シートが複数ある場合は、様式Ｂ・様式Ｄと同じ考え方で入れ子のSheetTabsに分ける
  // （インポート時にPhoto.displayOrderへ元シートの通し番号を保持しており、
  // これでグループ化している。captionは実際のキャプション文字列そのもの）。
  const recordPhotoGroups: { sheetIndex: number; photos: typeof recordPhotos }[] = [];
  for (const p of recordPhotos) {
    const key = p.displayOrder;
    let group = recordPhotoGroups.find((g) => g.sheetIndex === key);
    if (!group) {
      group = { sheetIndex: key, photos: [] };
      recordPhotoGroups.push(group);
    }
    group.photos.push(p);
  }
  recordPhotoGroups.sort((a, b) => a.sheetIndex - b.sheetIndex);
  const formRecordPhotos = (
    <section className="overflow-x-auto rounded-t border border-b-0 border-gray-400 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="border-b border-gray-400 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">現状記録写真</h2>
      </div>
      {recordPhotoGroups.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 dark:text-gray-500">現状記録写真はありません</p>
      ) : (
        <SheetTabs
          tabs={recordPhotoGroups.map((g, i) => ({
            id: `group-${g.sheetIndex}`,
            label: seqToCircledNumber(i + 1),
            content: (
              // 実データでは基本4枚（Excel上もG23/AY23/G41/AY41の4箇所）なので、
              // 既定は2列（2×2）で並べる。3枚しかない場合のみ、横一列（3列）に
              // する（4枚時に2×2、3枚時に横3つ、という指示に合わせた特例）。
              // 見た目（縦横比aspect-video・切れずに全体を表示）はPhotoSlotと統一しつつ、
              // グループ全体を1つのPhotoLightboxGroupにまとめることで、拡大表示中に
              // このグループ内の4枚を「前へ／次へ」でめくれるようにしている
              // （PhotoSlotを個別に使うと写真ごとに独立したグループになり、
              // めくれなくなってしまうため、ここでは直接組み立てている）。
              <PhotoLightboxGroup photos={g.photos}>
                <div
                  className={`grid grid-cols-1 gap-3 p-3 ${
                    g.photos.length === 3 ? "sm:grid-cols-3" : g.photos.length >= 2 ? "sm:grid-cols-2" : ""
                  }`}
                >
                  {g.photos.map((p, i) => (
                    <div key={p.id}>
                      <PhotoLightboxThumbnail index={i}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={p.caption ?? "現状記録写真"}
                          title={p.caption ?? undefined}
                          className="aspect-video w-full cursor-zoom-in rounded border border-gray-300 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-800"
                        />
                      </PhotoLightboxThumbnail>
                      {p.caption && (
                        <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-300" title={p.caption}>
                          {p.caption}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </PhotoLightboxGroup>
            ),
          }))}
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

      {/* 施設管理番号等の基本情報は様式Ａ／Ｂ／Ｃを切り替えても常に見えるよう、
          タブ切替（SheetTabs）の外に独立させている。様式Ｄは元々自分のタブ内に
          同じ情報を再掲する作りのため対象外（コメント参照）。 */}
      {commonHeader}

      <SheetTabs
        tabs={[
          { id: "formA", label: "様式Ａ", content: formA },
          { id: "formB", label: "様式Ｂ", content: formB },
          { id: "formC", label: "様式Ｃ", content: formC },
          { id: "formD", label: "様式Ｄ", content: formD },
          { id: "recordPhotos", label: "現状記録写真", content: formRecordPhotos },
          { id: "documents", label: "カルテ資料", content: documents },
        ]}
      />
    </div>
  );
}

// commonHeader（常時表示の基本情報バー）用の「ラベル：値」1項目。flex-wrapの
// 子要素として使うため、項目自体は折り返さない（whitespace-nowrap）が、
// 項目同士は幅が足りなければ次の行に折り返す。
function HeaderItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap text-gray-700 dark:text-gray-200">
      <span className="text-gray-400 dark:text-gray-500">{label}: </span>
      {children}
    </span>
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
