import { createKarte } from "@/lib/actions/karte-actions";
import KarteForm from "@/components/KarteForm";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// カルテ新規登録画面（指示書4.9「新規登録」）。
export default function NewKartePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <BackLink fallbackHref="/karte">
        ← 検索・一覧に戻る
      </BackLink>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">新規カルテ登録</h1>
      <KarteForm action={createKarte} submitLabel="登録する" />
    </div>
  );
}
