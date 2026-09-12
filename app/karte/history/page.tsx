import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatJstDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  CREATE: "作成",
  UPDATE: "更新",
  DELETE: "削除",
};

const ACTION_BADGE_COLOR: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400",
};

// 編集履歴画面（ヘッダーの「編集履歴」から遷移）。ログイン機能が無いMVPのため
// 「誰が」は記録しておらず、事務所全体で共有する「いつ・何が・どう変わったか」の
// 簡易ログを新しい順に並べるだけの画面にしている（lib/audit.ts参照）。
export default async function AuditHistoryPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 地図に戻る
      </Link>
      <div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">編集履歴</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          直近{logs.length}件の編集操作です（最大100件まで保持）。ログイン機能が無いため、
          誰が行った操作かは記録されません。
        </p>
      </div>

      {logs.length === 0 ? (
        <p className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-400 dark:text-gray-500">
          編集履歴がまだありません。
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-300 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-900">
          {logs.map((log) => (
            <li key={log.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${ACTION_BADGE_COLOR[log.action] ?? ""}`}
              >
                {ACTION_LABEL[log.action] ?? log.action}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-gray-800 dark:text-gray-100">
                  {log.karteFacilityNo ? (
                    <Link href={`/karte/${log.karteFacilityNo}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                      {log.summary}
                    </Link>
                  ) : (
                    log.summary
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  {log.entityType} ・ {formatJstDateTime(log.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
