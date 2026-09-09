import Link from "next/link";
import { createKarte } from "@/lib/actions/karte-actions";
import KarteForm from "@/components/KarteForm";

export const dynamic = "force-dynamic";

// カルテ新規登録画面（指示書4.9「新規登録」）。
export default function NewKartePage() {
  return (
    <div className="space-y-4">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 検索・一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">新規カルテ登録</h1>
      <KarteForm action={createKarte} submitLabel="登録する" />
    </div>
  );
}
