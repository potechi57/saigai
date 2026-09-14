import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

// 認証PoC用のログイン画面。middleware.tsにより、未ログインでの他ページへの
// アクセスはここへリダイレクトされる（lib/auth.ts・middleware.ts参照）。
// 【PoCの範囲】現時点ではユーザー登録・パスワードリセット画面は無く、
// scripts/seed-poc-user.tsで作成したテストユーザーでのログイン確認が目的。
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="mx-auto mt-20 max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">道路施設管理 Web GIS</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        ログインしてください（認証機能PoC。テストアカウントでの検証中です）。
      </p>
      <LoginForm callbackUrl={callbackUrl ?? "/karte"} />
    </div>
  );
}
