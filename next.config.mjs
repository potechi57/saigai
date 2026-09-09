/** @type {import('next').NextConfig} */
const nextConfig = {
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
