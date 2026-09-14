import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// 認証PoC: ログインしていないユーザーを/loginへリダイレクトする（lib/auth.ts参照）。
// ファイル名・関数名はNext.js 16の規約変更に合わせて"proxy"にしている
// （旧middleware.tsはNext.js 16で非推奨。node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/proxy.md参照。AGENTS.mdの「breaking
// changes」注意書きに従い、生成されたdev警告を無視せずここで対応した）。
//
// 【重要】Next.js公式ドキュメントには「matcherの変更やServer Functionの配置換えで
// proxyの保護が意図せず外れることがあるため、proxyだけに頼らず各Server Function
// 内でも認証・認可を確認すべき」という明記がある。このPoCの段階ではページ単位の
// 保護のみ検証しており、各Server Actions内での認証チェックは未実装（本実装フェーズ
// で対応が必要）。
//
// 【PoCの範囲】ログインしていなければ問答無用で/loginへ、という最小限の保護のみ
// 検証する。ロールに応じた細かい権限制御は方式確定後の本実装フェーズで対応する。
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthRoute = pathname.startsWith("/api/auth");
  const isLoginPage = pathname === "/login";

  if (isAuthRoute || isLoginPage) return NextResponse.next();

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

// Next.jsの静的アセット・画像最適化等のパスは除外する（保護不要かつ、除外しないと
// 全ページで不要なProxy実行が発生する）。
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
