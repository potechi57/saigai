"use client";

import { useActionState } from "react";
import { uploadPhoto } from "@/lib/actions/photo-actions";

// 画像アップロードは指示書の要望通り、Excel取込とは別の独立した仕組みにしている
// （データ本体はExcel取込／手入力、写真は個別アップロード）。
// targetIdを省略するとカルテ本体の写真（様式Ａの点検地点位置図・現況写真に相当）になる。
export default function PhotoUploadForm({
  targetId,
  karteId,
  karteFacilityNo,
  compact,
}: {
  targetId?: string | null;
  karteId: string;
  karteFacilityNo: string;
  compact?: boolean;
}) {
  const action = uploadPhoto.bind(null, targetId ?? null, karteId, karteFacilityNo);
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className={`flex flex-wrap items-end gap-2 ${compact ? "text-xs" : "text-sm"}`}>
      <input type="file" name="file" accept="image/*" required className="text-xs" />
      <input type="date" name="takenAt" className="rounded border border-gray-300 px-1.5 py-1 text-xs" />
      <input
        type="text"
        name="caption"
        placeholder="キャプション（任意）"
        className="rounded border border-gray-300 px-1.5 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
      >
        {isPending ? "アップロード中..." : "写真を追加"}
      </button>
      {state && !state.ok && <span className="text-red-600">{state.error}</span>}
      {state && state.ok && <span className="text-green-700">追加しました</span>}
    </form>
  );
}
