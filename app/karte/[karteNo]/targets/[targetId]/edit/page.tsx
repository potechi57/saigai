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

// 点検対象の編集画面。防災カルテ様式Ｂ（着目すべき変状の詳細記録）に相当する見た目・項目にしている。
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

  return (
    <div className="space-y-4">
      <Link href={`/karte/${karteNo}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← カルテ詳細に戻る
      </Link>

      <section className="overflow-x-auto rounded border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2">
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-100">
            防災カルテ様式Ｂ　（{KARTE_TYPE_LABEL[target.karte.karteType] ?? target.karte.karteType}）
          </h1>
        </div>
        <table className="w-full min-w-[600px] border-collapse text-xs">
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
          <div className="p-3">
            <h2 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
              &lt;詳細スケッチ欄&gt;・&lt;写真張付欄&gt;
            </h2>
            <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
              紙の様式は2枠固定だが、Web版では複数枚アップロードできる（デジタル化のメリットとして拡張）。
            </p>
            {target.photos.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {target.photos.map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.caption ?? undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption ?? "詳細スケッチ・写真"}
                      className="h-28 w-28 rounded border border-gray-300 dark:border-gray-700 object-cover"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="mb-2 text-sm text-gray-400 dark:text-gray-500">未登録</p>
            )}
            <PhotoUploadForm targetId={target.id} karteId={target.karteId} karteFacilityNo={karteNo} compact />
          </div>

          <form action={updateAction} className="space-y-3 p-3 text-sm">
            <TextField name="name" label="対象名称（Web版独自項目）" defaultValue={target.name} required />
            <TextAreaField name="description" label="説明（Web版独自項目）" defaultValue={target.description} />
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
            <button type="submit" className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600">
              保存する
            </button>
          </form>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-1 text-left align-middle font-medium whitespace-nowrap text-gray-600 dark:text-gray-300">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 align-middle">{children}</td>;
}
