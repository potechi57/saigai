"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RESPONSE_META, responseMeta } from "@/lib/labels";
import { haversineDistanceMeters, formatDistanceMeters } from "@/lib/geo";
import { setHomeLocation, clearHomeLocation } from "@/lib/actions/settings-actions";

export type MapKarte = {
  id: string;
  facilityNo: string;
  routeName: string;
  karteTypeLabel: string;
  responseCategory: string;
  latitude: number;
  longitude: number;
  isFavorite?: boolean; // ★を地図上でも見分けられるようにする（お気に入り機能）
};

export type HomeLocation = { latitude: number; longitude: number; label: string | null } | null;

// 地図APIはGoogle Maps等への差し替えを見据え、業務データ（MapKarte）とは疎結合にしている
// （指示書3章「地図表示部分と業務データを疎結合にする」方針。現時点ではAPIキー不要な
// OpenStreetMapタイル + Leafletを採用。将来Google Maps Platformに切り替える場合、この
// コンポーネントの内部実装だけを差し替えればよい）。
//
// 「地図を中心とした画面」への刷新に伴い、以前は地図の上に積んでいた凡例・現在地ボタン等の
// UIを地図の上への浮動オーバーレイに変更し、地図自体が親要素いっぱい（h-full w-full）を
// 占めるようにしている（親側でheightを決める。app/karte/page.tsx参照）。
export default function MapView({
  kartes,
  home,
  allowSetHome = false,
}: {
  kartes: MapKarte[];
  home?: HomeLocation;
  allowSetHome?: boolean;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const homeMarkerRef = useRef<L.Marker | null>(null);
  const currentLocationMarkerRef = useRef<L.CircleMarker | null>(null);
  const currentLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [settingHome, setSettingHome] = useState(false);
  const [savingHome, setSavingHome] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  // マーカーのポップアップは開いたとき（＝そのカルテ地点を選択したとき）に初めて
  // ホーム/現在地からの距離を計算して表示する（常時全マーカーぶん計算・表示すると
  // 「必要最小限の情報のみ表示する」という方針に反するため）。
  // ポップアップの中身は文字列としてLeafletに渡す都合上、home/現在地が後から変わっても
  // 内容を書き換えられるよう、最新値をrefに保持しておき、popupopen時点で参照する。
  const homeRef = useRef(home);
  homeRef.current = home;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // 初期表示は島根県松江市付近（サンプルデータの所在地）。実データ投入後は
    // 全カルテのbounds、または現在地に合わせて調整する想定。
    const map = L.map(containerRef.current).setView([35.46, 133.06], 12);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const bounds: L.LatLngExpression[] = [];

    for (const k of kartes) {
      const meta = responseMeta(k.responseCategory);
      const icon = L.divIcon({
        className: "",
        html: `<div style="
            background:${meta.color};
            width:28px;height:28px;border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            border:2px solid white;
            box-shadow:0 1px 3px rgba(0,0,0,0.4);
            display:flex;align-items:center;justify-content:center;
          "><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:bold;">${meta.mark}</span>${
            k.isFavorite
              ? '<span style="position:absolute;top:-8px;right:-6px;transform:rotate(45deg);font-size:13px;">★</span>'
              : ""
          }</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });

      const marker = L.marker([k.latitude, k.longitude], { icon }).addTo(map);
      const distHomeId = `dist-home-${k.id}`;
      const distCurId = `dist-current-${k.id}`;
      const routeBtnId = `route-btn-${k.id}`;
      marker.bindPopup(
        `<div style="font-size:13px;min-width:180px;">
           <div style="font-weight:600;">${escapeHtml(k.routeName)}${k.isFavorite ? " ★" : ""}</div>
           <div style="color:#666;">${escapeHtml(k.facilityNo)} ・ ${escapeHtml(k.karteTypeLabel)}</div>
           <div style="margin-top:4px;">対応区分: ${escapeHtml(meta.label)}</div>
           <div id="${distHomeId}" style="margin-top:6px;color:#374151;font-size:12px;"></div>
           <div id="${distCurId}" style="color:#374151;font-size:12px;"></div>
           <button id="${routeBtnId}" type="button" style="margin-top:4px;font-size:12px;color:#2563eb;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;">
             道路距離を調べる（試験的）
           </button>
           <div style="margin-top:6px;"><a href="/karte/${encodeURIComponent(k.facilityNo)}" style="color:#2563eb;">詳細を見る →</a></div>
         </div>`
      );

      // ポップアップを開いた＝この地点を選択した瞬間に、ホーム/現在地からの直線距離を
      // 埋め込む（常時計算しないことで地図上の情報量を絞る）。
      marker.on("popupopen", () => {
        const homeEl = document.getElementById(distHomeId);
        if (homeEl) {
          const h = homeRef.current;
          homeEl.textContent = h
            ? `🏠 ホームから ${formatDistanceMeters(
                haversineDistanceMeters(h.latitude, h.longitude, k.latitude, k.longitude)
              )}（直線距離）`
            : "🏠 ホーム位置が未設定です";
        }
        const curEl = document.getElementById(distCurId);
        if (curEl) {
          const c = currentLocationRef.current;
          curEl.textContent = c
            ? `📍 現在地から ${formatDistanceMeters(
                haversineDistanceMeters(c.lat, c.lng, k.latitude, k.longitude)
              )}（直線距離）`
            : "";
        }
        const btn = document.getElementById(routeBtnId) as HTMLButtonElement | null;
        if (btn) {
          btn.addEventListener(
            "click",
            () => {
              const c = currentLocationRef.current;
              const h = homeRef.current;
              const origin = c ?? (h ? { lat: h.latitude, lng: h.longitude } : null);
              if (!origin) {
                btn.textContent = "ホーム位置または現在地を先に設定してください";
                btn.disabled = true;
                return;
              }
              btn.textContent = "取得中...";
              btn.disabled = true;
              fetchRoadRouteDistance(origin.lat, origin.lng, k.latitude, k.longitude).then((result) => {
                if (!result.ok) {
                  btn.textContent = `取得失敗（${result.error}）`;
                  btn.disabled = false;
                  return;
                }
                const minutes = Math.round(result.seconds / 60);
                btn.outerHTML = `<div style="margin-top:4px;color:#374151;font-size:12px;">🚗 道路距離(参考): ${formatDistanceMeters(
                  result.meters
                )} ・ 約${minutes}分</div>`;
              });
            },
            { once: true }
          );
        }
      });

      bounds.push([k.latitude, k.longitude]);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 15 });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // kartesはサーバーコンポーネントから初回描画時に渡される固定値のため、
    // マウント時の1回だけ地図を構築すれば十分（依存配列は意図的に空）。
    // home/現在地は上記の通りrefで参照するため、ここでは依存にしない
    // （変更のたびに地図全体を作り直すと、ズーム・パン位置が失われるため）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ホーム位置ピンは、地図本体を作り直さずに独立して追加・更新・削除する
  // （上の初期化effectとは別立てにする理由は直上のコメントの通り）。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (homeMarkerRef.current) {
      homeMarkerRef.current.remove();
      homeMarkerRef.current = null;
    }
    if (!home) return;
    const icon = L.divIcon({
      className: "",
      html: `<div style="font-size:26px;line-height:28px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));">🏠</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 26],
      popupAnchor: [0, -24],
    });
    const marker = L.marker([home.latitude, home.longitude], { icon, zIndexOffset: 1000 }).addTo(map);
    marker.bindPopup(`<div style="font-size:13px;"><strong>${escapeHtml(home.label || "ホーム位置")}</strong></div>`);
    homeMarkerRef.current = marker;
  }, [home]);

  // ホーム位置設定モード中は、地図をクリックできることが分かるようカーソルを変える
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor = settingHome ? "crosshair" : "";
    }
  }, [settingHome]);

  // ホーム位置設定モードのときだけ、地図クリックでホーム位置を保存する
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    function handleClick(e: L.LeafletMouseEvent) {
      if (!settingHome) return;
      setSettingHome(false);
      setSavingHome(true);
      setHomeError(null);
      setHomeLocation(e.latlng.lat, e.latlng.lng).then((result) => {
        setSavingHome(false);
        if (!result.ok) {
          setHomeError(result.error);
          return;
        }
        router.refresh(); // サーバー側のhome設定を取り直し、ピン・距離表示に反映する
      });
    }
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [settingHome, router]);

  function handleLocate() {
    const map = mapRef.current;
    if (!map) return;
    if (!navigator.geolocation) {
      setLocateError("この端末では現在地を取得できません。");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        currentLocationRef.current = { lat: latitude, lng: longitude };
        map.setView([latitude, longitude], 15);
        if (currentLocationMarkerRef.current) {
          currentLocationMarkerRef.current.setLatLng([latitude, longitude]);
        } else {
          currentLocationMarkerRef.current = L.circleMarker([latitude, longitude], {
            radius: 8,
            color: "#2563eb",
            fillColor: "#60a5fa",
            fillOpacity: 0.9,
            weight: 2,
          })
            .addTo(map)
            .bindPopup("現在地");
        }
        setLocating(false);
      },
      (err) => {
        setLocateError(`現在地を取得できませんでした（${err.message}）`);
        setLocating(false);
      }
    );
  }

  function handleClearHome() {
    setSavingHome(true);
    setHomeError(null);
    clearHomeLocation().then((result) => {
      setSavingHome(false);
      if (!result.ok) {
        setHomeError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

      {/* 凡例（左下）。常時表示する情報はここに限定し、それ以外はマーカー選択時の
          ポップアップに追い出すことで、地図上の情報量を最小限にとどめている。 */}
      <div className="absolute bottom-3 left-3 z-[1000] flex flex-wrap gap-2 rounded bg-white/90 px-2 py-1.5 text-xs text-gray-600 shadow dark:bg-gray-900/90 dark:text-gray-300">
        {Object.entries(RESPONSE_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1">
            <span
              style={{ background: meta.color }}
              className="inline-block h-3 w-3 rounded-full text-center text-[8px] leading-3 text-white"
            >
              {meta.mark}
            </span>
            {meta.label}
          </span>
        ))}
      </div>

      {/* 現在地・ホーム位置の操作（右上）。ズームコントロールは左上のLeaflet標準位置の
          ままなので、右上に置いて重ならないようにしている。 */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-1.5">
        {allowSetHome && (
          <button
            type="button"
            onClick={() => setSettingHome((v) => !v)}
            className={`rounded border px-3 py-1 text-xs shadow ${
              settingHome
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            }`}
          >
            {settingHome ? "地図をクリックして設定（クリックで解除）" : home ? "🏠 ホーム位置を変更" : "🏠 ホーム位置を設定"}
          </button>
        )}
        {allowSetHome && home && !settingHome && (
          <button
            type="button"
            onClick={handleClearHome}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-500 shadow hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            ホーム位置を解除
          </button>
        )}
        <button
          type="button"
          onClick={handleLocate}
          disabled={locating}
          className="rounded border border-gray-300 bg-white px-3 py-1 text-xs shadow hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
        >
          {locating ? "取得中..." : "📍 現在地"}
        </button>
        {savingHome && <span className="rounded bg-white/90 px-2 py-1 text-xs text-gray-500 shadow dark:bg-gray-900/90 dark:text-gray-400">保存中...</span>}
        {homeError && <span className="max-w-[14rem] rounded bg-white/90 px-2 py-1 text-right text-xs text-red-600 shadow dark:bg-gray-900/90 dark:text-red-400">{homeError}</span>}
        {locateError && <span className="max-w-[14rem] rounded bg-white/90 px-2 py-1 text-right text-xs text-red-600 shadow dark:bg-gray-900/90 dark:text-red-400">{locateError}</span>}
      </div>
    </div>
  );
}

// OSRM（Open Source Routing Machine）の公開デモサーバーを使い、道路経路に沿った
// 距離・所要時間を取得する。APIキーが不要で試せる貴重な選択肢だが、あくまで
// 動作確認・デモ用の共用サーバーであり、SLAが無く商用の常用には向かない
// （本格運用する場合は自前でOSRMを立てるか、Google Directions等の有償APIに
// 切り替える必要がある。lib/geo.ts冒頭のコメントも参照）。
// そのため既定では呼び出さず、ポップアップ内のボタンを押した場合のみ
// オンデマンドで1回だけ叩く形にしている。
async function fetchRoadRouteDistance(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<{ ok: true; meters: number; seconds: number } | { ok: false; error: string }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return { ok: false, error: "経路が見つかりません" };
    return { ok: true, meters: route.distance, seconds: route.duration };
  } catch {
    return { ok: false, error: "通信エラー" };
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
