"use client";

// 削除（論理削除含む）等、取り消しにくい操作の前にブラウザ標準の確認ダイアログを挟む。
// 指示書12章「削除については誤操作防止のため、原則として論理削除または確認ダイアログを使用する」
// に対応（この画面では論理削除＋確認ダイアログの両方を採用している）。
export default function ConfirmSubmitButton({
  message,
  children,
  className,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
