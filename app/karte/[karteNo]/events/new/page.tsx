import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createInspectionEvent } from "@/lib/actions/karte-actions";
import { TextField, NumberField, DateField, TextAreaField, SelectField } from "@/components/FormFields";
import SubmitButton from "@/components/SubmitButton";
import { RESPONSE_META } from "@/lib/labels";

export const dynamic = "force-dynamic";

const WEATHER_LABEL = { SUNNY: "晴", CLOUDY: "曇", RAIN: "雨", SNOW: "雪" };
const JUDGEMENT_LABEL = Object.fromEntries(
  Object.entries(RESPONSE_META).map(([value, meta]) => [value, meta.label])
);

// 点検記録の新規登録画面（指示書12章「点検記録」編集）。
// 実際の防災カルテ様式Ｃの構造（1回の点検日に対し、その時点で追跡中の全点検対象について
// 前回との差異・被災履歴・補修履歴を記録する）に合わせ、1回の登録操作で
// InspectionEvent（点検イベント本体）とInspectionResult（対象ごとの結果）をまとめて作成する。
export default async function NewInspectionEventPage({ params }: { params: Promise<{ karteNo: string }> }) {
  const { karteNo } = await params;
  const karte = await prisma.karte.findUnique({
    where: { facilityNo: karteNo },
    include: {
      targets: { where: { isActive: true }, orderBy: { displayOrder: "asc" } },
    },
  });

  if (!karte) notFound();

  const targetIds = karte.targets.map((t) => t.id);
  const action = createInspectionEvent.bind(null, karte.id, karte.facilityNo, targetIds);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href={`/karte/${karte.facilityNo}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← カルテ詳細に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">点検記録の登録: {karte.routeName}</h1>

      {karte.targets.length === 0 && (
        <p className="rounded border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-3 text-sm text-yellow-800 dark:text-yellow-300">
          追跡中の点検対象がまだありません。先に
          <Link href={`/karte/${karte.facilityNo}/targets/new`} className="mx-1 underline">
            点検対象を追加
          </Link>
          してください。
        </p>
      )}

      <form action={action} className="space-y-4">
        <section className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <h2 className="mb-3 font-semibold text-gray-700 dark:text-gray-200">点検の概要</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            <DateField name="inspectionDate" label="点検日" required />
            <TextField name="inspectorName" label="点検者名" />
            <SelectField name="weather" label="天候" options={WEATHER_LABEL} />
            <NumberField name="nextInspectionDueYear" label="次回点検実施時期（年度）" step="1" />
            <DateField name="specialistInspectionDate" label="専門技術者による点検年月日" />
            <TextField name="specialistName" label="専門技術者名" />
            <SelectField name="specialistJudgement" label="点検後の対応（専門技術者の判定）" options={JUDGEMENT_LABEL} />
            <TextAreaField name="specialTopics" label="点検時の特記事項（点検時の対応）" />
          </div>
        </section>

        {karte.targets.length > 0 && (
          <section className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <h2 className="mb-3 font-semibold text-gray-700 dark:text-gray-200">点検対象ごとの結果</h2>
            <div className="space-y-4">
              {karte.targets.map((t) => (
                <div key={t.id} className="border-t border-gray-200 dark:border-gray-700 pt-4 first:border-t-0 first:pt-0">
                  <h3 className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {karte.facilityNo}-T{String(t.sequenceNo).padStart(2, "0")} {t.name}
                  </h3>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" name={`result_${t.id}_diff`} className="h-4 w-4" />
                      前回との差異
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" name={`result_${t.id}_disaster`} className="h-4 w-4" />
                      被災履歴
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" name={`result_${t.id}_repair`} className="h-4 w-4" />
                      補修履歴
                    </label>
                  </div>
                  <textarea
                    name={`result_${t.id}_comment`}
                    placeholder="コメント（任意）"
                    rows={2}
                    className="mt-2 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <SubmitButton pendingLabel="登録中..." className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600">
          登録する
        </SubmitButton>
      </form>
    </div>
  );
}
