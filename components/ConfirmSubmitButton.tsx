"use client";

import { useFormStatus } from "react-dom";

// 削除（論理削除含む）等、取り消しにくい操作の前にブラウザ標準の確認ダイアログを挟む。
// 指示書12章「削除については誤操作防止のため、原則として論理削除または確認ダイアログを使用する」
// に対応（この画面では論理削除＋確認ダイアログの両方を採用している）。
// あわせてuseFormStatus()で送信中状態を検知し、確認後にボタンを無効化・ラベルを
// 変更する（処理中に画面が何も変わらず「止まったのか」と誤解されるのを防ぐため。
// components/SubmitButton.tsx と同じ理由・同じ制約＝必ず<form>の内側に置く）。
export default function ConfirmSubmitButton({
  message,
  children,
  pendingLabel = "処理中...",
  className,
}: {
  message: string;
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
      onClick={(e) => {
        if (!confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {pending && (
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {pending ? pendingLabel : children}
    </button>
  );
}
