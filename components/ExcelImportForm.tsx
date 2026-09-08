"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importKarteExcel } from "@/lib/actions/import-actions";

// エラー内容を画面にそのまま表示したいため、他の編集フォームと違い
// useActionState（React 19）でServer Actionの戻り値を受け取る形にしている。
export default function ExcelImportForm() {
  const [state, formAction, isPending] = useActionState(importKarteExcel, null);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4 rounded border border-gray-300 bg-white p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500">防災カルテExcelファイル（.xls / .xlsx）</span>
          <input type="file" name="file" accept=".xls,.xlsx" required className="block w-full text-sm" />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isPending ? "取り込み中..." : "取り込む"}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
      )}
      {state && state.ok && (
        <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          取り込みが完了しました（点検記録 {state.eventsImported} 件）。{" "}
          <Link href={`/karte/${state.facilityNo}`} className="underline">
            カルテを確認する →
          </Link>
        </p>
      )}
    </div>
  );
}
