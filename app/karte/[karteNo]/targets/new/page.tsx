import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createInspectionTarget } from "@/lib/actions/karte-actions";
import { TextField, TextAreaField } from "@/components/FormFields";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

// 点検対象（変状）の新規追加画面（指示書12章）。
// 実際の防災カルテ様式でも「変状追加」ボタンで随時追加できる仕組みになっており
// （03_DATABASE.md参照）、それに対応する。
export default async function NewInspectionTargetPage({ params }: { params: Promise<{ karteNo: string }> }) {
  const { karteNo } = await params;
  const karte = await prisma.karte.findUnique({ where: { facilityNo: karteNo }, select: { id: true, facilityNo: true, routeName: true } });
  if (!karte) notFound();

  const action = createInspectionTarget.bind(null, karte.id, karte.facilityNo);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href={`/karte/${karte.facilityNo}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← カルテ詳細に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">点検対象の追加: {karte.routeName}</h1>
      <form action={action} className="space-y-4 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <TextField name="name" label="対象名称" placeholder="例: 起点側法面、P-3付近の浮石 等" required />
        <TextAreaField name="description" label="説明" />
        <SubmitButton pendingLabel="追加中..." className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600">
          追加する
        </SubmitButton>
      </form>
    </div>
  );
}
