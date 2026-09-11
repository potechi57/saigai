import { prisma } from "@/lib/prisma";
import { PhotoSourceForm } from "@prisma/client";

export type StartEndPhotos = { startPhotoUrl?: string; endPhotoUrl?: string };

// 地図ピンのポップアップに「なんとなくこの辺りかと分かる」程度の小さな参考写真として
// 表示するため、現状記録写真（sourceForm=GENERAL_RECORD）の中から、キャプションに
// 「起点」「終点」を含む最初の1枚ずつを拾う。
// キャプションは実データの命名慣習（「起点側全景」等。lib/excel/karte-import.tsの
// extractRecordPhotoCaptions参照）に依存したベストエフォートの拾い方で、
// 該当するキャプションが無いカルテ（現状記録写真が無い、あってもキャプションに
// 起点／終点の文言が含まれない等）は単に表示されないだけで、エラーにはしない。
export async function getStartEndRecordPhotos(karteIds: string[]): Promise<Map<string, StartEndPhotos>> {
  if (karteIds.length === 0) return new Map();

  const photos = await prisma.photo.findMany({
    where: {
      karteId: { in: karteIds },
      sourceForm: PhotoSourceForm.GENERAL_RECORD,
      OR: [{ caption: { contains: "起点" } }, { caption: { contains: "終点" } }],
    },
    orderBy: { displayOrder: "asc" },
    select: { karteId: true, url: true, caption: true },
  });

  const result = new Map<string, StartEndPhotos>();
  for (const p of photos) {
    const entry = result.get(p.karteId) ?? {};
    const hasStart = p.caption?.includes("起点") ?? false;
    const hasEnd = p.caption?.includes("終点") ?? false;
    // キャプションに「起点」「終点」の両方が含まれる場合（例:「起点〜終点間の全景」）は、
    // どちらの地点の写真とも決め切れないため、誤って同じ写真が起点・終点の両方に
    // 表示されてしまわないよう、あえてどちらにも割り当てない（ベストエフォート）。
    if (hasStart && !hasEnd && !entry.startPhotoUrl) entry.startPhotoUrl = p.url;
    if (hasEnd && !hasStart && !entry.endPhotoUrl) entry.endPhotoUrl = p.url;
    result.set(p.karteId, entry);
  }
  return result;
}
