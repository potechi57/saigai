import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateInspectionTarget, setInspectionTargetActive } from "@/lib/actions/karte-actions";
import { TextField, TextAreaField, DateField, SelectField } from "@/components/FormFields";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import PhotoUploadForm from "@/components/PhotoUploadForm";
import { KARTE_TYPE_LABEL, WEATHER_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

function toDateInputValue(d: Date | null): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

// 点検対象の編集画面。防災カルテ様式Ｂ（変状ごとの詳細記録）に相当する見た目・項目にしている。
// 実際の様式Ｂのレイアウト（実データ複数件でdrawingのアンカー位置を確認済み）は、
// 左側に<詳細スケッチ欄>として写真2枚を縦に並べ、右側に<写真張付欄>として
// 大きめの写真1枚、その下に「着目すべき点」「チェック項目」を続ける、という
// 左右2列構成。実データでは<詳細スケッチ欄>にも（手描きスケッチではなく）実際の
// 写真が貼られていたため、Web版でも3枚とも写真として扱う。
// 削除は物理削除ではなく isActive=false への論理削除とする（誤操作防止、指示書12章の方針）。
export default async function EditInspectionTargetPage({
  params,
}: {
  params: Promise<{ karteNo: string; targetId: string }>;
}) {
  const { karteNo, targetId } = await params;
  const target = await prisma.inspectionTarget.findUnique({
    where: { id: targetId },
    include: {
      karte: { select: { facilityNo: true, routeName: true, karteType: true } },
      photos: { orderBy: { takenAt: "asc" } },
    },
  });

  if (!target || target.karte.facilityNo !== karteNo) notFound();

  const updateAction = updateInspectionTarget.bind(null, target.id, karteNo);
  const deactivateAction = setInspectionTargetActive.bind(null, target.id, karteNo, false);
  const reactivateAction = setInspectionTargetActive.bind(null, target.id, karteNo, true);
  const targetCode = `${karteNo}-T${String(target.sequenceNo).padStart(2, "0")}`;

  // 様式Ｂの実データでは<詳細スケッチ欄>に2枚・<写真張付欄>に1枚（合計3枚）という
  // 配置だったため、先頭3枚をその配置に当てはめる。4枚目以降は末尾にまとめて表示する
  // （複数枚アップロードできるというWeb版の柔軟性は残す）。
  const [sketchPhoto1, sketchPhoto2, pastePhoto] = target.photos;
  const overflowPhotos = target.photos.slice(3);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href={`/karte/${karteNo}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← カルテ詳細に戻る
      </Link>

      <section className="overflow-x-auto rounded border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2">
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-100">
            防災カルテ様式Ｂ　（{KARTE_TYPE_LABEL[target.karte.karteType] ?? target.karte.karteType}）
          </h1>
        </div>
        <table className="w-full border-collapse text-xs">
          <tbody>
            <tr>
              <Th>施設管理番号</Th>
              <Td>{target.karte.facilityNo}</Td>
              <Th>路線名</Th>
              <Td>{target.karte.routeName}</Td>
              <Th>変状 No.</Th>
              <Td>{targetCode}</Td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-1 divide-y divide-gray-400 dark:divide-gray-600 border-t border-gray-400 dark:border-gray-600 md:grid-cols-2 md:divide-x md:divide-y-0">
          {/* 左: <詳細スケッチ欄>（実データでは写真2枚が縦に並ぶ） */}
          <div className="p-3">
            <h2 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">&lt;詳細スケッチ欄&gt;</h2>
            <div className="space-y-3">
              <PhotoSlot photo={sketchPhoto1} heightClass="h-56" />
              <PhotoSlot photo={sketchPhoto2} heightClass="h-56" />
            </div>
          </div>

          {/* 右: <写真張付欄>（実データでは大きめの写真1枚）＋着目すべき点／チェック項目 */}
          <div className="p-3">
            <form action={updateAction} className="space-y-3 text-sm">
              <div>
                <h2 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">&lt;写真張付欄&gt;</h2>
                <PhotoSlot photo={pastePhoto} heightClass="h-[29rem]" />
              </div>
              <TextAreaField name="keyPoints" label="着目すべき点" defaultValue={target.keyPoints} />
              <TextAreaField name="checkItems" label="チェック項目" defaultValue={target.checkItems} />
              <div className="grid grid-cols-2 gap-3">
                <DateField
                  name="createdOnSiteDate"
                  label="作成年月日"
                  defaultValue={toDateInputValue(target.createdOnSiteDate)}
                />
                <SelectField
                  name="createdOnSiteWeather"
                  label="天候"
                  defaultValue={target.createdOnSiteWeather ?? undefined}
                  options={WEATHER_LABEL}
                />
              </div>
              <hr className="border-gray-200 dark:border-gray-700" />
              <p className="text-xs text-gray-400 dark:text-gray-500">以下はWeb版独自の項目（様式Ｂには無い）</p>
              <TextField name="name" label="対象名称" defaultValue={target.name} required />
              <TextAreaField name="description" label="説明" defaultValue={target.description} />
              <button type="submit" className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600">
                保存する
              </button>
            </form>
          </div>
        </div>

        <div className="border-t border-gray-400 p-3 dark:border-gray-600">
          <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
            写真を追加（上の3枠に順番に反映されます。4枚目以降は下にまとめて表示されます）
          </p>
          <PhotoUploadForm targetId={target.id} karteId={target.karteId} karteFacilityNo={karteNo} compact />
          {overflowPhotos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {overflowPhotos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.caption ?? undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.caption ?? "写真"}
                    className="h-28 w-28 rounded border border-gray-300 object-cover dark:border-gray-700"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <h2 className="mb-2 font-semibold text-gray-700 dark:text-gray-200">状態</h2>
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
          現在の状態:{" "}
          {target.isActive ? (
            <span className="text-green-700 dark:text-green-400">追跡中</span>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">解消済み（非表示）</span>
          )}
        </p>
        {target.isActive ? (
          <form action={deactivateAction}>
            <ConfirmSubmitButton
              message="この点検対象を「解消済み」にしますか？記録は削除されず、一覧から非表示になるだけです。"
              className="rounded border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
            >
              解消済みにする（論理削除）
            </ConfirmSubmitButton>
          </form>
        ) : (
          <form action={reactivateAction}>
            <button type="submit" className="rounded border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              追跡を再開する
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PhotoSlot({
  photo,
  heightClass,
}: {
  photo?: { id: string; url: string; caption: string | null };
  heightClass: string;
}) {
  if (!photo) {
    return (
      <div
        className={`flex ${heightClass} items-center justify-center rounded border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500`}
      >
        写真なし
      </div>
    );
  }
  return (
    <a href={photo.url} target="_blank" rel="noreferrer" title={photo.caption ?? undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.caption ?? "写真"}
        className={`${heightClass} w-full rounded border border-gray-300 object-cover dark:border-gray-700`}
      />
    </a>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-1 text-left align-middle font-medium whitespace-nowrap text-gray-600 dark:text-gray-300">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 align-middle whitespace-nowrap">
      {children}
    </td>
  );
}
