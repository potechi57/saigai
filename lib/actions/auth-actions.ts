"use server";

import { signIn, signOut } from "@/lib/auth";
import { AuthError } from "next-auth";

export type LoginResult = { ok: false; error: string } | null;

// ログインフォーム（app/login/page.tsx）から呼ぶ。Auth.jsのsignIn()は成功時に
// 内部でNEXT_REDIRECTを送出してリダイレクトする（Next.jsのredirect()と同じ仕組み）
// ため、それ以外のエラー（AuthError＝認証情報が不正等）だけを捕まえて分かりやすい
// メッセージに変換する。NEXT_REDIRECTまで飲み込んでしまうとリダイレクトが起きなく
// なるため、AuthError以外は再送出する（Auth.js公式ドキュメントの推奨パターン）。
export async function loginAction(_prevState: LoginResult, formData: FormData): Promise<LoginResult> {
  const email = formData.get("email");
  const password = formData.get("password");
  const callbackUrl = formData.get("callbackUrl");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: typeof callbackUrl === "string" && callbackUrl ? callbackUrl : "/karte",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { ok: false, error: "メールアドレスまたはパスワードが正しくありません。" };
    }
    throw e;
  }
  return null;
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
