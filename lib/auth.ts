import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// 認証PoC（Auth.js v5 + Credentials Provider）。
// 本番実装の優先事項検討で「ログイン機能・アクセス制御」が最優先と判断され、
// 自前ID/パスワード方式と組織アカウント（Google Workspace等）連携方式のどちらが
// 適切か未確定だったため、外部サービスの設定作業が不要なCredentials Providerで
// まずAuth.jsがこのプロジェクトのスタック（Next.js 16 App Router）で問題なく
// 動くかを検証している（prisma/schema.prismaのUserモデルのコメントも参照）。
// 組織アカウント連携が採用された場合は、ここにGoogle/Microsoft Providerを
// 追加するだけで済む（Credentials Providerと共存可能）。
//
// セッションはJWT方式にしている（Prisma Adapter＋Sessionテーブルを使う方式も
// あるが、PoCの段階では最小構成にとどめる。CLAUDE.md「過剰設計を避ける」方針）。
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "メールアドレス", type: "email" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : null;
        const password = typeof credentials?.password === "string" ? credentials.password : null;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.hashedPassword);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    // JWT・セッションにroleを載せる（今後、Server Actions側での権限チェックに使う
    // 想定。PoCの現段階では未使用）。
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { role?: string }).role = token.role as string | undefined;
      }
      return session;
    },
  },
});
