// 開発用のサンプルデータ投入スクリプト。
// 実在の施設・地名と誤認されないよう、意図的に架空の名称（サンプル◯◯）にしている。
// 実データの取り込みは別途 Excel 取り込みスクリプトで対応する想定（未実装）。

import { PrismaClient, KarteType, ProjectCategory, RoadType, RoadStatus, GeodeticSystem, Weather, ResponseCategory, InspectionPeriodType, PhotoSourceForm } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("既存データを削除しています...");
  // 依存関係の順に削除（FK制約に注意）
  await prisma.photo.deleteMany();
  await prisma.inspectionResult.deleteMany();
  await prisma.disasterEvent.deleteMany();
  await prisma.inspectionEvent.deleteMany();
  await prisma.inspectionTarget.deleteMany();
  await prisma.attachmentDocument.deleteMany();
  await prisma.karteRockfallDetail.deleteMany();
  await prisma.karte.deleteMany();

  console.log("サンプルカルテを作成しています...");
  const karte = await prisma.karte.create({
    data: {
      facilityNo: "SAMPLE-0001",
      karteType: KarteType.ROCKFALL_COLLAPSE,
      manageOrgName: "サンプル県土木部",
      manageOrgCode: "9900000",
      routeName: "サンプル県道１号線",
      routeNo: "1",
      distanceMarkerFromKm: 12.3,
      distanceMarkerToKm: 12.5,
      sideOfRoad: "上",
      extensionLengthM: 200,
      projectCategory: ProjectCategory.GENERAL,
      roadType: RoadType.PREFECTURAL,
      roadStatus: RoadStatus.CURRENT,
      locationDistrict: "サンプル郡",
      locationTown: "サンプル町",
      landmark: "サンプル橋付近",
      latitude: 35.4612,
      longitude: 133.0655,
      geodeticSystem: GeodeticSystem.WORLD,
      preTrafficRestriction: false,
      continuousRainfallMm: 180,
      hourlyRainfallMm: 40,
      trafficVolumeWeekday: 3200,
      trafficVolumeHoliday: 2100,
      trafficCensusYear: "H27",
      trafficCensusPointCode: "Q11990",
      didArea: false,
      busRoute: true,
      detour: false,
      emergencyRoadCategory: "指定無",
      specialistInspectionRequired: true,
      keyDeformationSummary:
        "高さ15m程の急斜面で、複数の谷が集まる区間。落石対策は一部区間で未整備。（サンプルデータ）",
      inspectionContentSummary: "浮石・転石の状況、崖面の風化状況を目視で確認する。（サンプルデータ）",
      specialistComment: "既往対策工では不十分な可能性があり、継続監視が必要。（サンプルデータ）",
      responseCategory: ResponseCategory.HANDLED_BY_KARTE,
      responseEvaluatedAt: new Date("2024-04-01"),
      inspectionPeriodType: InspectionPeriodType.REGULAR,
      inspectionIntervalNote: "1年に1回",
      assumedDisasterForm: "落石により通行車両に被害が及ぶ可能性がある。（サンプルデータ）",
      responseWhenDeformed: "速やかに通行止め等の応急対応を行い、専門技術者へ連絡する。（サンプルデータ）",
      createdOnSiteDate: new Date("2024-04-01"),
      createdOnSiteWeather: Weather.SUNNY,
      inspectorName: "山田 太郎（サンプル）",
      inspectorCompany: "サンプル建設コンサルタント",
      inspectorTel: "000-0000-0000",
      specialistName: "鈴木 一郎（サンプル）",
      specialistCompany: "サンプル地質調査株式会社",
      specialistTel: "000-0000-0000",
      rockfallDetail: {
        create: {
          mainFormRockfall: true,
          mainFormCollapse: false,
        },
      },
    },
  });

  console.log("点検対象（変状）を作成しています...");
  const target1 = await prisma.inspectionTarget.create({
    data: {
      karteId: karte.id,
      sequenceNo: 1,
      name: "起点側法面（サンプル）",
      description: "垂直崖が続く区間。浮石が多数確認される。（サンプルデータ）",
      displayOrder: 0,
    },
  });
  const target2 = await prisma.inspectionTarget.create({
    data: {
      karteId: karte.id,
      sequenceNo: 2,
      name: "中央部法面（サンプル）",
      description: "既設の落石防護柵の背面。柵の嵩上げが必要と思われる箇所。（サンプルデータ）",
      displayOrder: 1,
    },
  });

  console.log("点検イベント・点検結果を作成しています...");
  const eventR6 = await prisma.inspectionEvent.create({
    data: {
      karteId: karte.id,
      inspectionDate: new Date("2024-06-01"),
      inspectorName: "山田 太郎（サンプル）",
      weather: Weather.SUNNY,
      specialTopics: "特記事項なし（サンプルデータ）",
      nextInspectionDueYear: 2025,
      results: {
        create: [
          { targetId: target1.id, diffFromPrevious: false, disasterHistory: false, repairHistory: false },
          { targetId: target2.id, diffFromPrevious: false, disasterHistory: false, repairHistory: false },
        ],
      },
    },
  });

  const eventR7 = await prisma.inspectionEvent.create({
    data: {
      karteId: karte.id,
      inspectionDate: new Date("2025-06-01"),
      inspectorName: "山田 太郎（サンプル）",
      weather: Weather.CLOUDY,
      specialTopics: "対象2で浮石の増加を確認。専門技術者への相談を推奨。（サンプルデータ）",
      specialistInspectionDate: new Date("2025-06-15"),
      specialistName: "鈴木 一郎（サンプル）",
      specialistJudgement: ResponseCategory.HANDLED_BY_KARTE,
      nextInspectionDueYear: 2026,
      results: {
        create: [
          { targetId: target1.id, diffFromPrevious: false, disasterHistory: false, repairHistory: false },
          {
            targetId: target2.id,
            diffFromPrevious: true,
            disasterHistory: false,
            repairHistory: false,
            comment: "浮石の増加を確認（サンプルデータ）",
          },
        ],
      },
    },
  });

  console.log("災害履歴（様式D相当）のサンプルを作成しています...");
  await prisma.disasterEvent.create({
    data: {
      karteId: karte.id,
      targetId: target2.id,
      disasterType: KarteType.ROCKFALL_COLLAPSE,
      occurredDate: new Date("2018-10-15"),
      scaleWidthM: 0.5,
      scaleLengthM: 1.0,
      scaleDepthM: 0.3,
      scaleComment: "落石が防護柵を一部超えて路肩に到達（サンプルデータ）",
      rainContinuousMm: 180,
      rainMaxHourlyMm: 40,
      causeComment: "台風接近に伴う豪雨（サンプルデータ）",
      damageDeaths: 0,
      damageInjured: 0,
      propertyDamageComment: "なし",
      closureFullHours: 0,
      closurePartialHours: 3,
      shoulderRestriction: true,
      countermeasureFiscalYear: 2018,
      countermeasureType: "落石防護柵の嵩上げ（暫定対策、サンプルデータ）",
      countermeasureCostMillionYen: 5,
      comment: "暫定対策済み。恒久対策は継続検討中。（サンプルデータ）",
    },
  });

  console.log("写真プレースホルダを作成しています...");
  await prisma.photo.create({
    data: {
      karteId: karte.id,
      targetId: target1.id,
      eventId: eventR6.id,
      url: "https://placehold.co/640x480?text=Sample+Photo+R6",
      sourceForm: PhotoSourceForm.FORM_B,
      takenAt: new Date("2024-06-01"),
      takenBy: "山田 太郎（サンプル）",
      caption: "起点側法面 R6点検時（サンプル画像）",
      displayOrder: 0,
    },
  });
  await prisma.photo.create({
    data: {
      karteId: karte.id,
      targetId: target1.id,
      eventId: eventR7.id,
      url: "https://placehold.co/640x480?text=Sample+Photo+R7",
      sourceForm: PhotoSourceForm.FORM_B,
      takenAt: new Date("2025-06-01"),
      takenBy: "山田 太郎（サンプル）",
      caption: "起点側法面 R7点検時（サンプル画像）",
      displayOrder: 0,
    },
  });

  console.log("検索・地図画面の動作確認用に、簡易なサンプルカルテを追加作成しています...");
  await prisma.karte.create({
    data: {
      facilityNo: "SAMPLE-0002",
      karteType: KarteType.LANDSLIDE,
      routeName: "サンプル国道２号線",
      routeNo: "2",
      locationDistrict: "サンプル市",
      locationTown: "サンプル台",
      latitude: 35.48,
      longitude: 133.09,
      geodeticSystem: GeodeticSystem.WORLD,
      responseCategory: ResponseCategory.COUNTERMEASURE_NEEDED,
      responseEvaluatedAt: new Date("2025-05-01"),
    },
  });
  await prisma.karte.create({
    data: {
      facilityNo: "SAMPLE-0003",
      karteType: KarteType.ROCKFALL_COLLAPSE,
      routeName: "サンプル県道３号線",
      routeNo: "3",
      locationDistrict: "サンプル郡",
      locationTown: "サンプル浜",
      latitude: 35.43,
      longitude: 133.02,
      geodeticSystem: GeodeticSystem.WORLD,
      responseCategory: ResponseCategory.NO_COUNTERMEASURE_NEEDED,
      responseEvaluatedAt: new Date("2025-05-01"),
      rockfallDetail: { create: { mainFormRockfall: true, mainFormCollapse: true } },
    },
  });

  console.log("完了しました。カルテID:", karte.id, "施設管理番号:", karte.facilityNo);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
