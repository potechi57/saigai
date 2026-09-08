import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createInspectionTarget } from "@/lib/actions/karte-actions";
import { TextField, TextAreaField } from "@/components/FormFields";

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
    <div className="space-y-4">
      <Link href={`/karte/${karte.facilityNo}`} className="text-sm text-blue-600 hover:underline">
        ← カルテ詳細に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800">点検対象の追加: {karte.routeName}</h1>
      <form action={action} className="space-y-4 rounded border border-gray-300 bg-white p-4">
        <TextField name="name" label="対象名称" placeholder="例: 起点側法面、P-3付近の浮石 等" required />
        <TextAreaField name="description" label="説明" />
        <button type="submit" className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700">
          追加する
        </button>
      </form>
    </div>
  );
}
