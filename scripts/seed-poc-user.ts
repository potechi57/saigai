// 認証PoC用のテストユーザーを作成する一回限りのスクリプト。
// 実行: npx tsx scripts/seed-poc-user.ts <email> <password> [role]
// role省略時はADMIN（PoC検証用のため）。
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [, , email, password, roleArg] = process.argv;
  if (!email || !password) {
    console.error("使い方: npx tsx scripts/seed-poc-user.ts <email> <password> [ADMIN|EDITOR|VIEWER]");
    process.exit(1);
  }
  const role = roleArg && roleArg in UserRole ? (roleArg as UserRole) : UserRole.ADMIN;
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, hashedPassword, role, name: "PoCテストユーザー" },
    update: { hashedPassword, role },
  });
  console.log(`ユーザーを作成/更新しました: ${user.email} (role=${user.role})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
