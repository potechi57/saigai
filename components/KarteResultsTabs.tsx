"use client";

import { useState } from "react";
import MapView, { type MapKarte } from "@/components/MapLoader";

// 検索・一覧画面（旧 /karte）と地図検索画面（旧 /karte/map）を1画面に統合する
// タブ切替コンポーネント。検索フォームは1つで共有し、その結果を「一覧」「地図」
// どちらの見た目で見るかだけを切り替える（地図は検索条件を無視して全件表示していた
// 従来の実装の方が実質バグに近かったため、統合により解消される）。
//
// タブ切替のたびにMapViewを再マウントする（常時マウントしたままdisplay:noneで
// 隠す方式にすると、非表示中のLeafletコンテナはサイズが0になり地図の初期化が
// おかしくなる問題があるため、あえて毎回作り直す方が単純で安全）。
export default function KarteResultsTabs({
  count,
  mapKartes,
  withoutCoordsCount,
  children,
}: {
  count: number;
  mapKartes: MapKarte[];
  withoutCoordsCount: number;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<"list" | "map">("list");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b border-gray-300 dark:border-gray-700">
        <TabButton active={tab === "list"} onClick={() => setTab("list")}>
          一覧（{count}件）
        </TabButton>
        <TabButton active={tab === "map"} onClick={() => setTab("map")}>
          地図
        </TabButton>
      </div>

      {tab === "list" ? (
        children
      ) : mapKartes.length === 0 ? (
        <p className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-400 dark:text-gray-500">
          座標が登録されているカルテがありません。
        </p>
      ) : (
        <>
          <MapView kartes={mapKartes} />
          {withoutCoordsCount > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              ※ 座標未登録のため地図に表示できないカルテが {withoutCoordsCount} 件あります（一覧タブからご確認ください）。
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "border-b-2 border-gray-800 px-3 py-2 text-sm font-medium text-gray-800 dark:border-gray-100 dark:text-gray-100"
          : "border-b-2 border-transparent px-3 py-2 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
      }
    >
      {children}
    </button>
  );
}
