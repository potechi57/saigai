"use client";

import { useActionState } from "react";
import SheetTabs, { type SheetTab } from "@/components/SheetTabs";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import {
  addFacilityLedgerImage,
  renameFacilityLedgerImage,
  deleteFacilityLedgerImage,
  type AddFacilityLedgerImageResult,
  type RenameFacilityLedgerImageResult,
} from "@/lib/actions/facility-ledger-actions";

export type LedgerImage = { id: string; label: string; imageUrl: string };

// 台帳詳細画面（/ledgers/[id]）の画像タブ部分。同じ施設に複数枚（調書・図面等）の
// 画像を持たせ、SheetTabs（Excelのシート切替風タブ。components/SheetTabs.tsx）で
// 切り替えて見せる。各タブのタブ名（label）は登録後も自由に変更でき、画像の追加・
// 削除もこの画面から行える（会話ログ「タブの名前付けは任意として、取り込ませたあとに
// 任意で修正できるように」「同じ施設でまとめて何枚かの画像を読み込んだり、あとから、
// 別の画像をそこに追加できるように」参照）。
export default function FacilityLedgerImageManager({
  ledgerId,
  images,
}: {
  ledgerId: string;
  images: LedgerImage[];
}) {
  const tabs: SheetTab[] = images.map((img) => ({
    id: img.id,
    label: img.label,
    content: <ImagePane key={img.id} ledgerId={ledgerId} image={img} />,
  }));

  return (
    <div className="space-y-3">
      {tabs.length > 0 ? (
        <SheetTabs tabs={tabs} />
      ) : (
        <p className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
          まだ画像がありません。下のフォームから追加してください。
        </p>
      )}
      <AddImageForm ledgerId={ledgerId} />
    </div>
  );
}

function ImagePane({ ledgerId, image }: { ledgerId: string; image: LedgerImage }) {
  const renameAction = renameFacilityLedgerImage.bind(null, image.id, ledgerId);
  const [renameState, renameFormAction, isRenamePending] = useActionState<
    RenameFacilityLedgerImageResult | null,
    FormData
  >(renameAction, null);
  const deleteAction = deleteFacilityLedgerImage.bind(null, image.id, ledgerId);

  return (
    <div className="space-y-2 border border-gray-300 border-t-0 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <a href={image.imageUrl} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.imageUrl}
          alt={image.label}
          className="max-h-[70vh] w-full rounded border border-gray-300 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-800"
        />
      </a>
      <div className="flex flex-wrap items-center gap-3">
        <form action={renameFormAction} className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 dark:text-gray-400">タブ名</label>
          <input
            type="text"
            name="label"
            defaultValue={image.label}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            type="submit"
            disabled={isRenamePending}
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {isRenamePending ? "保存中..." : "保存"}
          </button>
          {renameState && !renameState.ok && (
            <span className="text-red-600 dark:text-red-400">{renameState.error}</span>
          )}
        </form>
        <form action={deleteAction}>
          <ConfirmSubmitButton
            message={`「${image.label}」を削除しますか？（元に戻せません）`}
            pendingLabel="削除中..."
            className="text-xs text-red-600 hover:underline dark:text-red-400"
          >
            この画像を削除
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

function AddImageForm({ ledgerId }: { ledgerId: string }) {
  const action = addFacilityLedgerImage.bind(null, ledgerId);
  const [state, formAction, isPending] = useActionState<AddFacilityLedgerImageResult | null, FormData>(
    action,
    null
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded border border-dashed border-gray-300 p-3 text-sm dark:border-gray-700"
    >
      <div>
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">画像を追加</label>
        <input type="file" name="image" accept="image/*" required className="block text-xs" />
      </div>
      <input
        type="text"
        name="label"
        placeholder="タブ名（任意。未入力なら自動採番）"
        className="rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-800 dark:bg-gray-700 px-3 py-1.5 text-xs text-white hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
      >
        {isPending ? "追加中..." : "追加する"}
      </button>
      {state && !state.ok && <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>}
      {state && state.ok && <span className="text-xs text-green-700 dark:text-green-400">追加しました</span>}
    </form>
  );
}
