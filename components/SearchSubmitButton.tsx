"use client";

import { useFormStatus } from "react-dom";

// 検索フォーム（next/formの<Form>）の送信ボタン用。useFormStatus()で
// フォーム送信中（＝カルテの再検索でDBアクセス中）を検知し、スピナー表示＋
// ボタン無効化する。「検索や条件クリア後、何も表示されず処理中か分からない」
// というUX指摘への対応（app/karte/page.tsxのFormの子孫でのみ使う）。
export default function SearchSubmitButton({ children, ...props }: React.ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return (
    <button {...props} disabled={pending} className={`${props.className ?? ""} disabled:cursor-wait disabled:opacity-60`}>
      {pending && (
        <span
          aria-hidden
          className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
        />
      )}
      {children}
    </button>
  );
}
