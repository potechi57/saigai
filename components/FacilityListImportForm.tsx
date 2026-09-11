"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { importFacilityListExcel, type ImportFacilityListResult } from "@/lib/actions/facility-list-actions";

// 「施設一覧」形式のExcel取込フォーム。カルテのExcel取込（ExcelImportForm.tsx）と
// 違い、写真やBlobアップロードが無い単純な表形式データのため、1回のServer Action
// 呼び出しで完結する（進捗の段階分けは不要）。
export default function FacilityListImportForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ImportFacilityListResult | null, FormData>(
    async (prevState, formData) => {
      const result = await importFacilityListExcel(prevState, formData);
      router.refresh(); // 取込履歴・地図等、同じ画面内の他の表示も最新化する
      return result;
    },
    null
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">施設一覧Excelファイル（.xls / .xlsx）</span>
          <input type="file" name="file" accept=".xls,.xlsx" required disabled={isPending} className="block w-full text-sm" />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          {isPending ? "取り込み中..." : "取り込む"}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state && state.ok && (
        <p className="rounded border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3 text-sm text-green-800 dark:text-green-400">
          取り込みが完了しました（全{state.total}件中、新規{state.created}件・更新{state.updated}件）。{" "}
          <a href="/facility-list" className="underline">
            一覧・地図で確認する →
          </a>
        </p>
      )}
    </div>
  );
}
