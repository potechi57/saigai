import { handlers } from "@/lib/auth";

// Auth.jsの標準ルートハンドラ（サインイン・サインアウト・コールバック等）を
// そのまま委譲する。lib/auth.ts参照。
export const { GET, POST } = handlers;
