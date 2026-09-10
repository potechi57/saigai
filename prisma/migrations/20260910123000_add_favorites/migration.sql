-- お気に入り機能（prisma/schema.prisma の Favorite/FavoriteGroup/FavoriteGroupItem の
-- コメントも参照）。ログイン機能が無いMVPのため、ユーザーごとではなく事務所全体で
-- 共有する1つのお気に入りリストとして実装する。

CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "karteId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Favorite_karteId_key" ON "Favorite"("karteId");

ALTER TABLE "Favorite"
  ADD CONSTRAINT "Favorite_karteId_fkey"
  FOREIGN KEY ("karteId") REFERENCES "Karte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FavoriteGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FavoriteGroup_name_key" ON "FavoriteGroup"("name");

CREATE TABLE "FavoriteGroupItem" (
    "id" TEXT NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteGroupItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FavoriteGroupItem_favoriteId_groupId_key" ON "FavoriteGroupItem"("favoriteId", "groupId");

ALTER TABLE "FavoriteGroupItem"
  ADD CONSTRAINT "FavoriteGroupItem_favoriteId_fkey"
  FOREIGN KEY ("favoriteId") REFERENCES "Favorite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FavoriteGroupItem"
  ADD CONSTRAINT "FavoriteGroupItem_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "FavoriteGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
