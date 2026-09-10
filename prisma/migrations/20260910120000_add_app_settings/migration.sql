-- ホーム位置（県土整備事務所の所在地等）を保存するシングルトン設定テーブル。
-- ログイン機能が無いMVPのため、ユーザーごとではなく1行だけを使い回す
-- （prisma/schema.prisma の AppSettings のコメントも参照）。
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "homeLatitude" DECIMAL(9,6),
    "homeLongitude" DECIMAL(9,6),
    "homeLabel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
