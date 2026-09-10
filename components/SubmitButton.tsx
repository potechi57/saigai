"use client";

import { useFormStatus } from "react-dom";

// Server Actionを呼ぶ<form>の送信ボタン。useFormStatus()で「自分が属するform」の
// 送信中状態を検知し、押した瞬間からボタンが無効化・表示が変わることで処理中だと
// 分かるようにする（保存等の処理中、画面が何も変わらず「システムが止まったのか」と
// 誤解されることを避けるため。各種フォームで共通化する）。
// useFormStatusは最も近い祖先<form>の状態しか読めない実装のため、このコンポーネントは
// 必ず<form>の内側に置くこと（外に置いても常にpending=falseになる）。
export default function SubmitButton({
  children,
  pendingLabel = "保存中...",
  className,
}: {
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
    >
      {pending && (
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {pending ? pendingLabel : children}
    </button>
  );
}
