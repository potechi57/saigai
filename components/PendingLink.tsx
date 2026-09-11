"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

// next/linkでのクライアント側遷移中、リンクの隣に小さな回転スピナーを表示する
// 汎用コンポーネント。「検索条件をクリア」「最近の検索」等、クリック後に
// カルテの再検索（DBアクセスを伴う）が走るリンクで、処理中であることが
// 見た目で分かるようにするために使う（useLinkStatusはLinkの子孫コンポーネント
// でしか使えないため、中でだけ使う専用のヒント部品PendingHintを用意している）。
export default function PendingLink({ href, className, children, ...rest }: ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={className} {...rest}>
      <PendingHint />
      {children}
    </Link>
  );
}

function PendingHint() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
    />
  );
}
