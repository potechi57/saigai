import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateInspectionTarget, setInspectionTargetActive } from "@/lib/actions/karte-actions";
import { TextField, TextAreaField, DateField, SelectField } from "@/components/FormFields";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import SubmitButton from "@/components/SubmitButton";
import PhotoUploadForm from "@/components/PhotoUploadForm";
import PhotoSlot from "@/components/PhotoSlot";
import { KARTE_TYPE_LABEL, WEATHER_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

function toDateInputValue(d: Date | null): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

// 点検対象の編集画面。防災カルテ様式Ｂ（変状ごとの詳細記録）に相当する見た目・項目にしている。
// 実際の様式Ｂのレイアウトは、左側に<詳細スケッチ欄>（EMF/WMFスケッチに注記
// テキスト・図形が重なることが多く、1枚の合成画像として取り込む。
// lib/excel/karte-image-extract.tsのextractFormBImages参照）、右側に<写真張付欄>
// （それ以外の個別抽出写真。0枚以上）、その下に「着目すべき点」「チェック項目」を
// 続ける、という左右2列構成。
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
      // Excel取込写真はtakenAtを設定しない（全てnull）ため、takenAtだけでは順序が
      // 不定になる（PostgreSQLはnull同士の順序を保証しない）。詳細スケッチ欄の合成
      // 画像を必ず先頭にするため、createdAtを第2キーにして挿入順を保証する。
      photos: { orderBy: [{ takenAt: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!target || target.karte.facilityNo !== karteNo) notFound();

  const updateAction = updateInspectionTarget.bind(null, target.id, karteNo);
  const deactivateAction = setInspectionTargetActive.bind(null, target.id, karteNo, false);
  const reactivateAction = setInspectionTargetActive.bind(null, target.id, karteNo, true);
  const targetCode = `${karteNo}-T${String(target.sequenceNo).padStart(2, "0")}`;

  // 新方式（extractFormBImages）では、詳細スケッチ欄は常に1枚の合成画像（先頭）、
  // 写真張付欄はそれ以外の個別抽出写真（0枚以上）という構成になる（旧来のCloud Run
  // 失敗時フォールバックでは、個別抽出した写真がそのまま複数枚並ぶこともある。その
  // 場合は先頭を詳細スケッチ欄、残りを写真張付欄に割り当てる）。
  const [sketchPhoto, ...pastePhotos] = target.photos;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
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
          {/* 左: <詳細スケッチ欄>（合成画像1枚） */}
          <div className="p-3">
            <h2 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">&lt;詳細スケッチ欄&gt;</h2>
            {/* 個別写真だった頃は「様式Ｂの写真が大きすぎる」という指摘を受けw-2/3に
                縮小していたが、新方式では元々2枚だった写真を1枚の合成画像にまとめている
                分、内容が詰まって見づらくなるため、列幅いっぱい（w-full）に戻して
                大きく表示する。 */}
            <div className="mx-auto w-full">
              <PhotoSlot photo={sketchPhoto} />
            </div>
          </div>

          {/* 右: <写真張付欄>（個別抽出した写真。0枚以上）＋着目すべき点／チェック項目 */}
          <div className="p-3">
            <form action={updateAction} className="space-y-3 text-sm">
              <div>
                <h2 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">&lt;写真張付欄&gt;</h2>
                <div className="mx-auto w-2/3 space-y-3">
                  {pastePhotos.length > 0 ? (
                    pastePhotos.map((p) => <PhotoSlot key={p.id} photo={p} />)
                  ) : (
                    <PhotoSlot photo={null} />
                  )}
                </div>
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
              <SubmitButton pendingLabel="保存中..." className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600">
                保存する
              </SubmitButton>
            </form>
          </div>
        </div>

        <div className="border-t border-gray-400 p-3 dark:border-gray-600">
          <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
            写真を追加（先頭が&lt;詳細スケッチ欄&gt;、2枚目以降が&lt;写真張付欄&gt;に反映されます）
          </p>
          <PhotoUploadForm targetId={target.id} karteId={target.karteId} karteFacilityNo={karteNo} compact />
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
              pendingLabel="処理中..."
              className="rounded border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
            >
              解消済みにする（論理削除）
            </ConfirmSubmitButton>
          </form>
        ) : (
          <form action={reactivateAction}>
            <SubmitButton pendingLabel="処理中..." className="rounded border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              追跡を再開する
            </SubmitButton>
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
  return (
    <td className="border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 align-middle whitespace-nowrap">
      {children}
    </td>
  );
}
