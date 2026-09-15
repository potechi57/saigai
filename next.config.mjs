/** @type {import('next').NextConfig} */
const nextConfig = {
  // ビルド版数の確認・強制更新（会話ログ「アプリの更新・バージョン確認」
  // components/AppVersionSection.tsx参照）のため、ビルド時点のGitコミットと
  // ビルド日時をクライアントへ公開する。VERCEL_GIT_COMMIT_SHAはVercelが
  // ビルド時に自動設定する環境変数（ローカルビルドでは未設定＝"local"になる）。
  env: {
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  experimental: {
    serverActions: {
      // 防災カルテのExcel原本は写真が埋め込まれており数MBになることが多く、
      // Next.jsのServer Actionの既定値（1MB）では足りない。
      // なお本番（Vercel）ではVercel Functions自体のリクエストサイズ上限が別途あるため、
      // この設定だけでは不十分（詳細はlib/actions/import-actions.tsのコメント参照）。
      // ローカル開発・自前ホスティング時のための緩和。
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
