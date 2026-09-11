"use client";

import { useFormStatus } from "react-dom";

// 検索フォーム（next/formの<Form>）の送信ボタン用。useFormStatus()で
// フォーム送信中（＝カルテの再検索でDBアクセス中）を検知し、スピナー表示＋
// ボタン無効化する。「検索や条件クリア後、何も表示されず処理中か分からない」
// というUX指摘への対応（app/karte/page.tsxのFormの子孫でのみ使う）。
//
// 【重要】next/formの<Form>は内部で`new FormData(formElement)`
// （送信ボタンを指定しない1引数版）でクエリを組み立てているため、
// ネイティブのHTMLフォームと違い、<button name="view" value="...">のような
// 送信ボタン自身のname/valueは一切クエリに含まれない（実際に「検索結果を
// 一覧で表示する」ボタンが機能しない不具合として顕在化した）。
// そのため、name="view"の隠しinput（page.tsx側）をこのボタンのonClickで
// 直接書き換えることで、代わりにその値をFormDataに含める（隠しinputの値は
// 1引数版のFormDataでも正しく含まれる）。
export default function SearchSubmitButton({
  children,
  targetView,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { targetView: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      disabled={pending}
      onClick={(e) => {
        const hidden = e.currentTarget.form?.elements.namedItem("view");
        if (hidden instanceof HTMLInputElement) hidden.value = targetView;
        onClick?.(e);
      }}
      className={`${props.className ?? ""} disabled:cursor-wait disabled:opacity-60`}
    >
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
