"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RESPONSE_META, responseMeta } from "@/lib/labels";
import { haversineDistanceMeters, formatDistanceMeters } from "@/lib/geo";
import { setHomeLocation, clearHomeLocation } from "@/lib/actions/settings-actions";
import { setFavorite } from "@/lib/actions/favorite-actions";

export type MapKarte = {
  id: string;
  facilityNo: string;
  routeName: string;
  karteTypeLabel: string;
  responseCategory: string;
  latitude: number;
  longitude: number;
  isFavorite?: boolean; // ★を地図上でも見分けられるようにする（お気に入り機能）
  // 現状記録写真のうち、キャプションに「起点」「終点」を含む最初の1枚ずつ
  // （lib/map-photos.ts参照）。ポップアップにサムネイルとして表示するためのもので、
  // 無ければ単に表示しない。
  startPhotoUrl?: string;
  endPhotoUrl?: string;
  // ポップアップに表示する追加情報（いずれも無ければ「—」扱いで表示を省略）。
  extensionLengthM?: number | null; // 延長(m)
  location?: string | null; // 所在地（locationDistrict + locationTownを結合済みの文字列）
  lastInspectionDateLabel?: string | null; // 最終点検日時（表示用に整形済みの文字列）
};

// トンネル台帳等、道路防災カルテ（Karte）とは別枠の台帳（画像1枚＋最低限の
// 基本情報のみ。prisma/schema.prismaのFacilityLedger参照）。カルテの検索条件とは
// 無関係に、緯度経度が登録されているものは常に地図へ表示する（件数が少ない想定のため、
// カルテのような「検索するまで表示しない」制御はしていない）。
export type MapLedger = {
  id: string;
  categoryLabel: string;
  name: string;
  routeName?: string | null;
  location?: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string;
  note?: string | null;
};

// 「施設一覧」形式のExcel（Accessの施設管理データベース出力）から取り込んだ
// 施設（prisma/schema.prismaのFacilityListItem参照）。カルテ・トンネル台帳とは
// さらに別のデータで、様式Ａ〜Ｄのような詳細記録は無く、施設の基本情報＋
// 直近点検の要約だけを持つ。台帳（FacilityLedger）と同様、件数が少ない想定
// （事務所単位の台帳全体）のため、カルテの検索条件とは無関係に常に表示する。
export type MapFacilityListItem = {
  id: string;
  managementNo: string;
  officeName?: string | null;
  routeName?: string | null;
  facilityType?: string | null;
  location?: string | null;
  latitude: number;
  longitude: number;
  soundnessGrade?: string | null;
  inspectionDateLabel?: string | null;
  mainFindings?: string | null;
  remarks?: string | null;
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
  ledgers = [],
  facilityListItems = [],
}: {
  kartes: MapKarte[];
  home?: HomeLocation;
  allowSetHome?: boolean;
  ledgers?: MapLedger[];
  facilityListItems?: MapFacilityListItem[];
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  // カルテのマーカー一式をまとめて持つレイヤーグループ。検索条件が変わって
  // kartesの中身が変わった際に、このグループだけをクリア＆再構築する
  // （地図本体・タイル・ホームマーカー等はそのまま維持する）。
  const karteLayerRef = useRef<L.LayerGroup | null>(null);
  // 直近にマーカーを構築した時点のカルテID集合（ソート済み文字列）。
  // お気に入りのトグルなどで「同じ検索結果のまま」router.refresh()される場合まで
  // 毎回マーカーを作り直すと、開いているポップアップが閉じる・ズーム位置が
  // リセットされるといった不要な副作用が出るため、実際にID集合が変わった
  // （＝新しい検索が行われた）ときだけ作り直す。
  const lastKarteIdsKeyRef = useRef<string | null>(null);
  // トンネル台帳等のマーカー一式（カルテとは別レイヤー。検索条件の影響を受けない）。
  const ledgerLayerRef = useRef<L.LayerGroup | null>(null);
  // 施設一覧Excelから取り込んだ施設のマーカー一式（同様に検索条件の影響を受けない）。
  const facilityListLayerRef = useRef<L.LayerGroup | null>(null);
  const homeMarkerRef = useRef<L.Marker | null>(null);
  const currentLocationMarkerRef = useRef<L.CircleMarker | null>(null);
  const currentLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [settingHome, setSettingHome] = useState(false);
  const [savingHome, setSavingHome] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const placeMarkerRef = useRef<L.CircleMarker | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  // マーカーのポップアップは開いたとき（＝そのカルテ地点を選択したとき）に初めて
  // ホーム/現在地からの距離を計算して表示する（常時全マーカーぶん計算・表示すると
  // 「必要最小限の情報のみ表示する」という方針に反するため）。
  // ポップアップの中身は文字列としてLeafletに渡す都合上、home/現在地が後から変わっても
  // 内容を書き換えられるよう、最新値をrefに保持しておき、popupopen時点で参照する。
  const homeRef = useRef(home);
  homeRef.current = home;

  // お気に入り状態も同様の理由でrefに持つ（初期値はサーバーから渡されたkartes、
  // 以降はポップアップ内の☆/★ボタンでの切り替えをその場で反映する）。
  const favoriteIdsRef = useRef<Set<string>>(new Set(kartes.filter((k) => k.isFavorite).map((k) => k.id)));

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

    // カルテ・台帳・施設一覧のマーカーは下のそれぞれ専用のeffectが構築する。
    // ここでは入れ物のレイヤーグループを地図に追加するだけ。
    karteLayerRef.current = L.layerGroup().addTo(map);
    ledgerLayerRef.current = L.layerGroup().addTo(map);
    facilityListLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      karteLayerRef.current = null;
      ledgerLayerRef.current = null;
      facilityListLayerRef.current = null;
    };
    // home/現在地は下記の通りrefで参照するため、ここでは依存にしない
    // （変更のたびに地図全体を作り直すと、ズーム・パン位置が失われるため）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // カルテのマーカーを構築する専用effect。検索条件が変わってkartesの中身
  // （IDの集合）が実際に変わったときだけマーカー一式を作り直す（お気に入り
  // トグル等、IDの集合が変わらないrouter.refresh()では何もしない。理由は
  // 上のlastKarteIdsKeyRefのコメント参照）。
  useEffect(() => {
    const map = mapRef.current;
    const layer = karteLayerRef.current;
    if (!map || !layer) return;

    const idsKey = kartes
      .map((k) => k.id)
      .sort()
      .join("|");
    if (idsKey === lastKarteIdsKeyRef.current) return;
    lastKarteIdsKeyRef.current = idsKey;

    layer.clearLayers();
    // お気に入りの状態も検索結果が変わるたびに最新化する（新しい検索結果には
    // 別カルテが含まれうるため、サーバーから渡された最新のisFavoriteを信頼する）。
    favoriteIdsRef.current = new Set(kartes.filter((k) => k.isFavorite).map((k) => k.id));

    const bounds: L.LatLngExpression[] = [];

    for (const k of kartes) {
      const meta = responseMeta(k.responseCategory);
      const marker = L.marker([k.latitude, k.longitude], { icon: buildMarkerIcon(meta, favoriteIdsRef.current.has(k.id)) }).addTo(
        layer
      );
      const distHomeId = `dist-home-${k.id}`;
      const distCurId = `dist-current-${k.id}`;
      const routeBtnId = `route-btn-${k.id}`;
      const favSlotId = `fav-slot-${k.id}`;
      marker.bindPopup(
        `<div style="font-size:13px;min-width:180px;">
           <div style="font-weight:600;">${escapeHtml(k.routeName)}</div>
           <div style="color:#666;">${escapeHtml(k.facilityNo)} ・ ${escapeHtml(k.karteTypeLabel)}</div>
           <div style="margin-top:6px;color:#374151;">所在地: ${escapeHtml(k.location || "—")}</div>
           <div style="color:#374151;">延長: ${k.extensionLengthM != null ? `${k.extensionLengthM} m` : "—"}</div>
           <div style="color:#374151;">緯度経度: ${k.latitude}, ${k.longitude}</div>
           <div style="margin-top:4px;">対応区分: ${escapeHtml(meta.label)}</div>
           <div style="color:#374151;">最終点検日時: ${escapeHtml(k.lastInspectionDateLabel || "—")}</div>
           ${buildStartEndPhotosHtml(k)}
           <div id="${favSlotId}" style="margin-top:6px;"></div>
           <div id="${distHomeId}" style="margin-top:6px;color:#374151;font-size:12px;"></div>
           <div id="${distCurId}" style="color:#374151;font-size:12px;"></div>
           <button id="${routeBtnId}" type="button" style="margin-top:4px;font-size:12px;color:#2563eb;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;">
             道路距離を調べる（試験的）
           </button>
           <div style="margin-top:6px;"><a href="/karte/${encodeURIComponent(k.facilityNo)}" style="color:#2563eb;">詳細を見る →</a></div>
         </div>`,
        // 起点/終点サムネイル（下記buildStartEndPhotosHtml、各450px）を2枚横に
        // 並べられるだけの幅を確保している（450*2+間隔+余白）。Leaflet既定の
        // ポップアップ幅（300px）よりかなり広いが、技術的な制約は無い
        // （幅が画面に収まらない場合はLeafletが地図を自動でパンして調整する。
        // 極端に狭い画面では窮屈になりうる点は既知のトレードオフ）。
        { maxWidth: 1000 }
      );

      // ポップアップを開いた＝この地点を選択した瞬間に、ホーム/現在地からの直線距離・
      // お気に入りの状態を埋め込む（常時計算・表示しないことで地図上の情報量を絞る）。
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
        renderFavSlot(favSlotId, k, marker, meta);
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

    // ポップアップ内の☆/★お気に入りボタンの中身を、現在の状態（favoriteIdsRef）に
    // 合わせて描画し直す。ポップアップを開くたび（popupopenのたび）に呼び出すことで、
    // 他のマーカーで切り替えた直後でも常に最新の状態を表示する。
    function renderFavSlot(slotId: string, k: MapKarte, marker: L.Marker, meta: ReturnType<typeof responseMeta>) {
      const slot = document.getElementById(slotId);
      if (!slot) return;
      const isFav = favoriteIdsRef.current.has(k.id);
      const btnId = `fav-toggle-${k.id}`;
      slot.innerHTML = isFav
        ? `<span style="font-size:12px;color:#a16207;">★ お気に入り済み</span> <button type="button" id="${btnId}" style="margin-left:6px;font-size:12px;color:#2563eb;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;">外す</button>`
        : `<button type="button" id="${btnId}" style="font-size:12px;color:#2563eb;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;">☆ お気に入りに追加</button>`;
      const btn = document.getElementById(btnId) as HTMLButtonElement | null;
      btn?.addEventListener(
        "click",
        () => {
          const next = !favoriteIdsRef.current.has(k.id);
          btn.disabled = true;
          btn.textContent = "処理中...";
          setFavorite(k.id, k.facilityNo, next).then((result) => {
            if (!result.ok) {
              btn.disabled = false;
              btn.textContent = `失敗（${result.error}）`;
              return;
            }
            if (next) favoriteIdsRef.current.add(k.id);
            else favoriteIdsRef.current.delete(k.id);
            marker.setIcon(buildMarkerIcon(meta, next));
            renderFavSlot(slotId, k, marker, meta);
            router.refresh(); // 一覧・お気に入り画面等、他の表示にも反映させる
          });
        },
        { once: true }
      );
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 15 });
    }
    // home/現在地は上記の通りrefで参照するため、依存には含めない
    // （home/現在地が変わるたびにマーカーを作り直す必要は無いため）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kartes]);

  // トンネル台帳等のマーカーを構築する専用effect。カルテの検索条件とは無関係に、
  // ledgersが変わるたびにそのまま作り直す（件数が少ない想定のため、カルテのような
  // 「同じ内容なら作り直さない」最適化はしていない。シンプルさ優先）。
  useEffect(() => {
    const map = mapRef.current;
    const layer = ledgerLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    for (const l of ledgers) {
      const marker = L.marker([l.latitude, l.longitude], { icon: buildLedgerMarkerIcon() }).addTo(layer);
      marker.bindPopup(
        `<div style="font-size:13px;min-width:180px;">
           <div style="font-weight:600;">${escapeHtml(l.name)}</div>
           <div style="color:#666;">${escapeHtml(l.categoryLabel)}</div>
           ${l.routeName ? `<div style="margin-top:4px;color:#374151;">路線名: ${escapeHtml(l.routeName)}</div>` : ""}
           ${l.location ? `<div style="color:#374151;">所在地: ${escapeHtml(l.location)}</div>` : ""}
           <a href="${escapeHtml(l.imageUrl)}" target="_blank" rel="noreferrer" style="display:block;margin-top:6px;">
             <img src="${escapeHtml(l.imageUrl)}" style="width:350px;max-width:350px;object-fit:contain;border-radius:4px;border:1px solid #d1d5db;display:block;" />
           </a>
           ${l.note ? `<div style="margin-top:6px;color:#374151;white-space:pre-wrap;">${escapeHtml(l.note)}</div>` : ""}
           <div style="margin-top:6px;"><a href="/ledgers" style="color:#2563eb;">台帳一覧を見る →</a></div>
         </div>`,
        { maxWidth: 400 }
      );
    }
  }, [ledgers]);

  // 施設一覧Excelから取り込んだ施設のマーカーを構築する専用effect。トンネル台帳
  // 同様、カルテの検索条件とは無関係に常に表示する。
  useEffect(() => {
    const map = mapRef.current;
    const layer = facilityListLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    for (const f of facilityListItems) {
      const marker = L.marker([f.latitude, f.longitude], { icon: buildFacilityListMarkerIcon() }).addTo(layer);
      marker.bindPopup(
        `<div style="font-size:13px;min-width:180px;">
           <div style="font-weight:600;">${escapeHtml(f.managementNo)}</div>
           ${f.facilityType ? `<div style="color:#666;">${escapeHtml(f.facilityType)}</div>` : ""}
           ${f.officeName ? `<div style="margin-top:4px;color:#374151;">管轄事務所: ${escapeHtml(f.officeName)}</div>` : ""}
           ${f.routeName ? `<div style="color:#374151;">路線名: ${escapeHtml(f.routeName)}</div>` : ""}
           ${f.location ? `<div style="color:#374151;">所在地: ${escapeHtml(f.location)}</div>` : ""}
           ${f.soundnessGrade ? `<div style="margin-top:4px;color:#374151;">健全度: ${escapeHtml(f.soundnessGrade)}</div>` : ""}
           ${f.inspectionDateLabel ? `<div style="color:#374151;">点検実施日: ${escapeHtml(f.inspectionDateLabel)}</div>` : ""}
           ${f.mainFindings ? `<div style="margin-top:6px;color:#374151;white-space:pre-wrap;">主な所見: ${escapeHtml(f.mainFindings)}</div>` : ""}
           ${f.remarks ? `<div style="margin-top:4px;color:#6b7280;white-space:pre-wrap;">備考: ${escapeHtml(f.remarks)}</div>` : ""}
           <div style="margin-top:6px;"><a href="/facility-list" style="color:#2563eb;">施設一覧を見る →</a></div>
         </div>`,
        { maxWidth: 360 }
      );
    }
  }, [facilityListItems]);

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

  // 「○○小学校」のような地名・施設名から地図を移動する場所検索（ジオコーディング）。
  // カルテの属性検索（左の検索条件パネル）とは別物で、あくまで「地図上のこの辺りを
  // 見たい」という目的地探しなので、地図自身のオーバーレイとして持たせている。
  // ジオコーディングにはAPIキー不要なNominatim（OpenStreetMapの公開検索API）を使う。
  // OSRM同様、あくまで公開のコミュニティ運営サービスであり、大量・高頻度な利用や
  // 商用の常用は利用ポリシー上想定されていない（1リクエスト/秒程度が上限の目安）。
  // ここではユーザーが検索ボタン/Enterを押した時だけ1回叩く形にしており、
  // 自動補完（入力のたびに叩く）は行わない。
  async function handlePlaceSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      const results: Array<{ lat: string; lon: string; display_name?: string }> = await res.json();
      const first = results[0];
      if (!first) {
        setPlaceError("見つかりませんでした。");
        return;
      }
      const lat = Number(first.lat);
      const lon = Number(first.lon);
      map.setView([lat, lon], 16);
      if (placeMarkerRef.current) {
        placeMarkerRef.current.setLatLng([lat, lon]);
      } else {
        placeMarkerRef.current = L.circleMarker([lat, lon], {
          radius: 9,
          color: "#7c3aed",
          fillColor: "#c4b5fd",
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(map);
      }
      placeMarkerRef.current.bindPopup(escapeHtml(first.display_name || q)).openPopup();
    } catch {
      setPlaceError("検索に失敗しました（通信エラー）。");
    } finally {
      setPlaceSearching(false);
    }
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

      {/* 場所検索（地名・施設名から地図を移動する。上部中央＝Leaflet標準の
          ズームコントロール（左上）ともホーム位置/現在地ボタン（右上）とも
          重ならない位置）。カルテの属性検索（左の検索条件パネル）とは別物。 */}
      <form
        onSubmit={handlePlaceSearch}
        className="absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 items-center gap-1.5 rounded bg-white/95 p-1.5 shadow dark:bg-gray-900/95"
      >
        <input
          type="text"
          value={placeQuery}
          onChange={(e) => setPlaceQuery(e.target.value)}
          placeholder="場所を検索（例: ○○小学校）"
          className="w-56 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={placeSearching}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
        >
          {placeSearching ? "検索中..." : "検索"}
        </button>
      </form>
      {placeError && (
        <div className="absolute left-1/2 top-14 z-[1000] -translate-x-1/2 rounded bg-white/95 px-2 py-1 text-xs text-red-600 shadow dark:bg-gray-900/95 dark:text-red-400">
          {placeError}
        </div>
      )}

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

// カルテ地点マーカーのアイコン。お気に入り済みかどうかで右肩に★を重ねるかを
// 切り替えるだけなので、初期表示時とお気に入り切り替え時（marker.setIcon）の
// 両方から呼べる関数として切り出している。
function buildMarkerIcon(meta: ReturnType<typeof responseMeta>, isFavorite: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
        background:${meta.color};
        width:28px;height:28px;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        border:2px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
      "><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:bold;">${meta.mark}</span>${
        isFavorite
          ? '<span style="position:absolute;top:-8px;right:-6px;transform:rotate(45deg);font-size:13px;">★</span>'
          : ""
      }</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

// トンネル台帳等のマーカーアイコン。カルテのしずく型（涙滴形）マーカーとは
// 見た目を変え、別種のピンだと一目で分かるようにしている（丸型・紫系の色）。
function buildLedgerMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
        background:#7c3aed;
        width:26px;height:26px;border-radius:50%;
        border:2px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        font-size:14px;
      ">🚇</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

// 施設一覧Excelから取り込んだ施設のマーカーアイコン。カルテ（しずく型）・
// トンネル台帳（丸型・紫）とも見た目を変え、正方形・オレンジ系の色にしている。
function buildFacilityListMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
        background:#ea580c;
        width:22px;height:22px;border-radius:4px;
        border:2px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        font-size:11px;
      ">🛣️</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  });
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

// 起点／終点の参考写真を、ポップアップ内のサムネイルとして組み立てる。
// 様式Ｂの写真（PhotoSlot、aspect-video＝16:9）と同じ縦横比のまま、
// 幅450px（高さ253px）で表示する。ポップアップ自体の幅を1000pxまで
// 広げている（bindPopupのmaxWidth）ため、2枚を横に並べて表示できる
// （flex-wrapにより、画面が狭く収まらない場合は自動的に縦積みに折り返す）。
// クリックすると元画像を別タブで開ける（拡大して詳しく見たい場合のため）。
// どちらも無ければ何も表示しない。
function buildStartEndPhotosHtml(k: MapKarte): string {
  if (!k.startPhotoUrl && !k.endPhotoUrl) return "";
  const thumb = (url: string, label: string) => `
    <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="text-align:center;text-decoration:none;flex-shrink:0;">
      <img src="${escapeHtml(url)}" style="width:450px;max-width:450px;height:253px;object-fit:cover;border-radius:4px;border:1px solid #d1d5db;display:block;" />
      <span style="font-size:12px;color:#6b7280;">${escapeHtml(label)}</span>
    </a>`;
  // flex-wrapを付けると、Leafletがポップアップ幅を決める際の計測パスで
  // （maxWidthが十分大きくても）2枚が縦に折り返されてしまうため、
  // 明示的にnowrapにして横並びを強制する（画面が狭い場合はポップアップが
  // 画面からはみ出す方向になるが、Leafletが地図を自動でパンして対応する）。
  return `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:nowrap;">
      ${k.startPhotoUrl ? thumb(k.startPhotoUrl, "起点") : ""}
      ${k.endPhotoUrl ? thumb(k.endPhotoUrl, "終点") : ""}
    </div>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
