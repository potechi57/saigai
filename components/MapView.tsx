"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RESPONSE_META, responseMeta } from "@/lib/labels";

export type MapKarte = {
  id: string;
  facilityNo: string;
  routeName: string;
  karteTypeLabel: string;
  responseCategory: string;
  latitude: number;
  longitude: number;
};

// 地図APIはGoogle Maps等への差し替えを見据え、業務データ（MapKarte）とは疎結合にしている
// （指示書3章「地図表示部分と業務データを疎結合にする」方針。現時点ではAPIキー不要な
// OpenStreetMapタイル + Leafletを採用。将来Google Maps Platformに切り替える場合、この
// コンポーネントの内部実装だけを差し替えればよい）。
export default function MapView({ kartes }: { kartes: MapKarte[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const currentLocationMarkerRef = useRef<L.CircleMarker | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

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
          "><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:bold;">${meta.mark}</span></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });

      const marker = L.marker([k.latitude, k.longitude], { icon }).addTo(map);
      marker.bindPopup(
        `<div style="font-size:13px;">
           <div style="font-weight:600;">${escapeHtml(k.routeName)}</div>
           <div style="color:#666;">${escapeHtml(k.facilityNo)} ・ ${escapeHtml(k.karteTypeLabel)}</div>
           <div style="margin-top:4px;">対応区分: ${escapeHtml(meta.label)}</div>
           <a href="/karte/${encodeURIComponent(k.facilityNo)}" style="color:#2563eb;">詳細を見る →</a>
         </div>`
      );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
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
        <button
          type="button"
          onClick={handleLocate}
          disabled={locating}
          className="rounded border border-gray-300 bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {locating ? "取得中..." : "📍 現在地"}
        </button>
      </div>
      {locateError && <p className="mb-2 text-xs text-red-600">{locateError}</p>}
      <div ref={containerRef} className="h-[70vh] w-full rounded border border-gray-300" />
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
