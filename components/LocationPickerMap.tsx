"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// 台帳（画像）登録フォーム（components/FacilityLedgerForm.tsx）用の、緯度経度を
// 決めるための小さな地図部品。Excelのような自動抽出元が無い台帳（トンネル台帳等）は
// 座標が分からないまま登録したいケースが多いため、数値を直接入力する以外に、
// 地図をクリックして選ぶ・地名で検索して選ぶという手段も用意する
// （場所検索の実装はcomponents/MapView.tsxの地名検索と同じ、APIキー不要な
// Nominatimを使う方式）。
//
// 選んだ結果はこのコンポーネント自身が持つ緯度・経度の<input>（フォーム送信時に
// サーバーが読む項目そのもの）にそのまま反映するので、呼び出し側のフォームや
// サーバー側の処理（lib/actions/facility-ledger-actions.ts）は変更不要。
export default function LocationPickerMap({
  latName = "latitude",
  lngName = "longitude",
  initialLatitude = null,
  initialLongitude = null,
}: {
  latName?: string;
  lngName?: string;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [lat, setLat] = useState<string>(initialLatitude != null ? String(initialLatitude) : "");
  const [lng, setLng] = useState<string>(initialLongitude != null ? String(initialLongitude) : "");
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  // 地図の初期化（マウント時に1回だけ）。
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const hasInitial = initialLatitude != null && initialLongitude != null;
    const center: [number, number] = hasInitial ? [initialLatitude!, initialLongitude!] : [35.46, 133.06];
    const map = L.map(containerRef.current).setView(center, hasInitial ? 15 : 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    map.on("click", (e: L.LeafletMouseEvent) => {
      setLat(e.latlng.lat.toFixed(6));
      setLng(e.latlng.lng.toFixed(6));
    });

    if (hasInitial) {
      markerRef.current = L.marker(center, { icon: pinIcon(), draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        setLat(pos.lat.toFixed(6));
        setLng(pos.lng.toFixed(6));
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // 初期値はマウント時にしか使わない（地図自体は1回だけ作る）ため、依存配列は空でよい。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lat/lngが変わるたびに（クリック・検索・手入力いずれの経路でも）マーカー位置を
  // 追従させる。数値として不正な間は動かさない（入力途中の状態を壊さないため）。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (lat.trim() === "" || lng.trim() === "" || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([latNum, lngNum]);
    } else {
      markerRef.current = L.marker([latNum, lngNum], { icon: pinIcon(), draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        setLat(pos.lat.toFixed(6));
        setLng(pos.lng.toFixed(6));
      });
    }
  }, [lat, lng]);

  async function handlePlaceSearch() {
    const q = placeQuery.trim();
    const map = mapRef.current;
    if (!q || !map) return;
    setPlaceSearching(true);
    setPlaceError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&accept-language=ja&q=${encodeURIComponent(
        q
      )}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const results: Array<{ lat: string; lon: string }> = await res.json();
      const first = results[0];
      if (!first) {
        setPlaceError("見つかりませんでした。");
        return;
      }
      const latitude = Number(first.lat);
      const longitude = Number(first.lon);
      map.setView([latitude, longitude], 16);
      setLat(latitude.toFixed(6));
      setLng(longitude.toFixed(6));
    } catch {
      setPlaceError("検索に失敗しました（通信エラー）。");
    } finally {
      setPlaceSearching(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">緯度</span>
          <input
            type="text"
            name={latName}
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">経度</span>
          <input
            type="text"
            name={lngName}
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        座標が分からない場合は、地図をクリックするか地名で検索して場所を選んでください（ピンはドラッグでも動かせます）。
      </p>

      {/* このコンポーネント自体が別のフォーム（FacilityLedgerForm等）の内側に
          埋め込まれる想定のため、ここでは<form>を使わない（HTML上<form>の入れ子は
          無効で、Reactのハイドレーションエラーにもなる）。Enterキーでも検索できる
          よう、テキスト入力側でKeyDownを拾っている。 */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={placeQuery}
          onChange={(e) => setPlaceQuery(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handlePlaceSearch();
            }
          }}
          placeholder="場所を検索（例: ○○トンネル、○○町）"
          className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={handlePlaceSearch}
          disabled={placeSearching}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
        >
          {placeSearching ? "検索中..." : "検索"}
        </button>
      </div>
      {placeError && <p className="text-xs text-red-600 dark:text-red-400">{placeError}</p>}

      <div ref={containerRef} className="h-56 w-full rounded border border-gray-300 dark:border-gray-700" />
    </div>
  );
}

function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
        background:#dc2626;
        width:18px;height:18px;border-radius:50%;
        border:2px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
      "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
