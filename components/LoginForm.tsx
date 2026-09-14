"use client";

import { useActionState } from "react";
import { loginAction, type LoginResult } from "@/lib/actions/auth-actions";
import SubmitButton from "@/components/SubmitButton";

// 認証PoC用のログインフォーム。lib/actions/auth-actions.ts参照。
export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState<LoginResult, FormData>(loginAction, null);

  return (
    <form action={formAction} className="space-y-4 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div>
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">メールアドレス</label>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">パスワード</label>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <SubmitButton pendingLabel="ログイン中..." className="w-full justify-center rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600">
        ログイン
      </SubmitButton>
    </form>
  );
}
