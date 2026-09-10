// 2点間の距離計算（クライアント・サーバー双方から使う純粋関数のみを置く）。
//
// ここで計算しているのはあくまで直線距離（大圏距離）であり、実際に車両が走る
// 道路経路の距離ではない（山間部では特に差が大きくなりうる）。道路経路の距離を
// 出すには外部の経路探索API（OSRM・Google Directions・OpenRouteService等）が
// 必要で、APIキー不要で試せるものとしてはOSRMの公開デモサーバーがあるが、
// 本番の常用には向かない（SLA無し・商用利用不可）ため、MVPでは直線距離を基本とし、
// 道路距離は地図上でカルテを選択した際に「参考値」として任意取得する形にしている
// （components/MapView.tsx の fetchRoadRouteDistance 呼び出し箇所を参照）。

// 地球を球体近似したときの平均半径(m)。Haversine公式で使う。
const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 2地点間の直線距離をメートル単位で返す（Haversine公式）。 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/** メートル値を「◯◯ m」「◯.◯ km」のように見やすい文字列にする。 */
export function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
