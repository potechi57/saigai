"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MOBILE_RESULT_KIND_LABEL, type MobileSearchResult } from "@/lib/mobile-search";

// 現場向け画面（/m）専用の軽量な地図。PC版（components/MapView.tsx）は
// ホーム位置・お気に入り・道路距離・場所検索等、機能が多く重いため、
// 「現在地の表示」と「検索結果のピン表示」だけに絞った別コンポーネントとして
// 新規に作った（会話ログ「webページに飛んだ際に、地図と現在地が表示されている
// 仕様がイメージ通り」参照）。地図の基本セットアップ（タイル・divIconでの
// マーカー描画）はMapView.tsxと同じ考え方を踏襲している。
const KIND_COLOR: Record<MobileSearchResult["kind"], string> = {
  karte: "#2563eb", // 青（/mの他の場所の距離表示と統一）
  ledger: "#9333ea", // 紫（PC版地図の台帳ピンと同系色）
  facility: "#ea580c", // 橙（PC版地図の施設一覧ピンと同系色）
  gateSign: "#16a34a", // 緑
};

function buildResultIcon(kind: MobileSearchResult["kind"]): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
        background:${KIND_COLOR[kind]};
        width:22px;height:22px;border-radius:50%;
        border:2px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
      "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  });
}

// 起点／終点／様式Ａ（点検地点位置図）の参考写真を、ポップアップ内に縦積みの
// サムネイルとして組み立てる（PC版地図 components/MapView.tsx の
// buildStartEndPhotosHtml と同じデータ・同じ考え方。会話ログ「スマホでも、
// ポイントをタップした際に関連する画像を表示してください」参照）。
//
// 【経緯】当初は起点・終点の2枚を幅100pxで横並びにしていたが、「小さすぎる」
// 「起点終点のみでは、どういう箇所なのかわからない」との指摘を受け
// （会話ログ参照）、様式Ａの合成画像（現地の状況がまとまって分かる）も加えた
// 上で、3枚とも横並びではなく縦に並べ、それぞれポップアップの横幅いっぱいに
// 広げる方式に変更した（横並びのままだと3枚では1枚あたりの幅がさらに
// 狭くなってしまうため）。どれも無ければ何も表示しない（kind==="karte"以外は
// これらのURLが元々付与されない）。
function buildKartePhotosHtml(r: MobileSearchResult): string {
  if (!r.startPhotoUrl && !r.endPhotoUrl && !r.formAPhotoUrl) return "";
  const row = (url: string, label: string) => `
    <a href="${url}" target="_blank" rel="noreferrer" style="display:block;text-align:center;text-decoration:none;">
      <img src="${url}" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:4px;border:1px solid #d1d5db;" />
      <span style="font-size:11px;color:#6b7280;">${label}</span>
    </a>`;
  return `<div style="margin-top:6px;display:flex;flex-direction:column;gap:8px;">
      ${r.startPhotoUrl ? row(r.startPhotoUrl, "起点") : ""}
      ${r.endPhotoUrl ? row(r.endPhotoUrl, "終点") : ""}
      ${r.formAPhotoUrl ? row(r.formAPhotoUrl, "点検地点位置図（様式Ａ）") : ""}
    </div>`;
}

const CURRENT_LOCATION_ICON = L.divIcon({
  className: "",
  html: `<div style="
      background:#60a5fa;width:16px;height:16px;border-radius:50%;
      border:3px solid #2563eb;box-shadow:0 0 0 4px rgba(37,99,235,0.25);
    "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export default function MobileMapView({
  results,
  center,
  radiusM,
  onMapTap,
}: {
  results: MobileSearchResult[];
  // 現在地検索（NearbySearchButton）から来た場合の検索中心地点。指定があれば
  // 初期表示の中心にする（結果のbounds合わせより、検索した地点そのものを
  // 中心に見せる方が現場での意図に合うため）。
  center: { lat: number; lng: number } | null;
  // 同心円の半径（メートル）。設定画面で変更できる（会話ログ「現在地検索の半径変更」）。
  // centerが無い場合は使われない。
  radiusM: number;
  // 地図（マーカー・ポップアップ以外の何も無い部分）をタップした時に呼ばれる。
  // 検索パネルを開いたまま地図を見たい場面で、いちいち✕を押さなくても地図タップで
  // 閉じられるようにするために使う（会話ログ「地図タップでパネルを自動的に閉じる」）。
  onMapTap?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const resultLayerRef = useRef<L.LayerGroup | null>(null);
  const currentLocationMarkerRef = useRef<L.Marker | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  // 検索結果が無い・現在地検索でもない通常表示時、地図の初期中心を決めるための
  // 島根県中央付近（MapView.tsxの初期表示と同じ座標）。
  const DEFAULT_CENTER: [number, number] = [35.46, 133.06];

  // onMapTapは親（app/m/page.tsx側）の状態次第で毎レンダー新しい関数参照になりうるが、
  // 地図初期化effectの依存配列に入れて再実行（＝地図を作り直す）したくないため、
  // refで最新の関数を保持し、リスナー登録は1回だけにする。
  const onMapTapRef = useRef(onMapTap);
  onMapTapRef.current = onMapTap;

  // 地図本体の初期化（1回だけ）。
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(
      center ? [center.lat, center.lng] : DEFAULT_CENTER,
      center ? 15 : 12
    );
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    resultLayerRef.current = L.layerGroup().addTo(map);

    // マーカー・ポップアップのクリックはLeaflet内部でmapへの伝播が止まるため、
    // ここは「地図の何も無い部分をタップした」場合だけ呼ばれる。
    map.on("click", () => onMapTapRef.current?.());

    return () => {
      map.remove();
      mapRef.current = null;
      resultLayerRef.current = null;
      currentLocationMarkerRef.current = null;
      radiusCircleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 現在地検索（半径1km）の対象範囲を、検索地点を中心にした円で地図上に描く
  // （会話ログ「現在地からの一キロの同心円を描写できませんか。どこまでを
  // 映しているのかが分かると便利」）。centerが無い（現在地検索でない）場合は
  // 円を消す。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (radiusCircleRef.current) {
      map.removeLayer(radiusCircleRef.current);
      radiusCircleRef.current = null;
    }
    if (center) {
      const circle = L.circle([center.lat, center.lng], {
        radius: radiusM,
        color: "#2563eb",
        weight: 1.5,
        fillColor: "#60a5fa",
        fillOpacity: 0.08,
      }).addTo(map);
      radiusCircleRef.current = circle;
      // 円がきちんと収まるようにズーム調整する（マウント時の初期表示は
      // zoom15固定のため、円が画面からはみ出す場合がある。検索地点・半径が
      // 変わった場合もここで追従する）。
      map.fitBounds(circle.getBounds(), { padding: [24, 24] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, radiusM]);

  // 現在地の自動取得・表示。ボタン操作（NearbySearchButton＝半径1km検索）とは別に、
  // ページを開いた時点で「今どこにいるか」を地図上に示す（会話ログ「地図と現在地が
  // 表示されている仕様」）。ユーザー操作を介さない自動取得のため、位置情報が
  // 許可されない・取得できない場合もエラー表示はせず、ただ現在地ピンが出ない
  // だけにする（NearbySearchButton側は明示的な操作なのでエラーを出す。この
  // 自動取得は受動的な演出のため、エラーで通知するとかえって煩わしいと判断）。
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapRef.current;
        if (!map) return;
        const { latitude, longitude } = pos.coords;
        if (currentLocationMarkerRef.current) {
          currentLocationMarkerRef.current.setLatLng([latitude, longitude]);
        } else {
          currentLocationMarkerRef.current = L.marker([latitude, longitude], {
            icon: CURRENT_LOCATION_ICON,
            zIndexOffset: 500,
          })
            .addTo(map)
            .bindPopup("現在地");
        }
        // 明示的な検索結果（center指定または検索結果あり）が無い、素のトップ画面の
        // 場合のみ、現在地に地図を寄せる（検索結果を見ている最中に地図が勝手に
        // 動いてしまうと分かりにくいため）。
        if (!center && results.length === 0) {
          map.setView([latitude, longitude], 14);
        }
      },
      () => {
        // 失敗時は何もしない（上記の通り、自動取得の失敗をユーザーに通知する必要は無い）。
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
    // 初回のみ（centerやresultsの変化のたびに取得し直す必要は無い）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 検索結果のピンを構築する。
  useEffect(() => {
    const map = mapRef.current;
    const layer = resultLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    // ポップアップの中身は、MapView.tsx（PC版地図）と同じく文字列HTML＋通常の
    // <a>リンクで組み立てる（タップで通常のページ遷移。/mの一覧側はnext/linkで
    // クライアント遷移しているが、Leafletのポップアップは元々Reactツリーの外側の
    // 生DOMのため、Reactコンポーネントをそのまま埋め込むにはcreateRoot等の追加の
    // 仕組みが要る。地図上のピンは「タップしたら詳細を開く」の一撃で十分なため、
    // 複雑さに見合わないと判断し見送った）。
    // ポップアップの最大幅。当初は画面幅いっぱい（画面幅-48px）まで広げていたが、
    // 3枚の写真を縦積みにした結果、ポップアップが画面のほとんどを覆ってしまい、
    // 「枠外をタップして地図に戻る」操作がしづらいという指摘を受けた（会話ログ
    // 「枠外を押してマップに戻るという操作をしたいので、もう少し小さくして
    // ください」参照）。画面幅の60%程度に抑えることで、ポップアップの周囲に
    // 地図（＝タップして閉じられる領域）を十分残す。画面幅そのものに追従させる
    // ため、forEachの外（＝結果一覧が変わるたびに1回）で計算する。
    const popupMaxWidth = Math.min(window.innerWidth * 0.6, 240);

    results.forEach((r) => {
      if (r.latitude == null || r.longitude == null) return; // 座標が無い施設はピンを打てない
      const marker = L.marker([r.latitude, r.longitude], { icon: buildResultIcon(r.kind) }).addTo(layer);
      marker.bindPopup(
        `<div style="width:${popupMaxWidth}px">
           <div style="font-size:10px;color:#6b7280;margin-bottom:2px;">${MOBILE_RESULT_KIND_LABEL[r.kind]}</div>
           <a href="${r.href}" style="font-weight:600;color:#2563eb;">${r.title}</a>
           ${r.subtitle ? `<div style="font-size:12px;color:#6b7280;">${r.subtitle}</div>` : ""}
           ${buildKartePhotosHtml(r)}
         </div>`,
        { maxWidth: popupMaxWidth }
      );
    });

    // 検索結果があれば、それらが収まるようbounds調整（現在地検索の場合はcenter指定を
    // 優先しているため、ここでは上書きしない）。
    if (!center && results.length > 0) {
      const coords = results.filter((r) => r.latitude != null && r.longitude != null) as Array<
        MobileSearchResult & { latitude: number; longitude: number }
      >;
      if (coords.length > 0) {
        map.fitBounds(
          coords.map((r) => [r.latitude, r.longitude]),
          { padding: [32, 32], maxZoom: 15 }
        );
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  return <div ref={containerRef} className="h-full w-full" />;
}
