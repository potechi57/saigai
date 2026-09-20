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

// 緯度経度の10進度→度分秒（DMS）表示変換。
//
// 【経緯】防災カルテ等のExcel様式では緯度・経度が度・分・秒の3つの別セルに
// 分けて入力されており（lib/excel/karte-import.tsのdms()参照）、取込時に
// decimal = deg + min/60 + sec/3600 で10進度に変換してDB（Decimal(9,6)）に
// 保存している。しかしWeb画面側は保存済みの10進度をそのまま表示していたため、
// 「エクセル上では度分秒だが、Web上では10進法になっている」という指摘を受けた。
// DBの保存形式（10進度）自体は変えず、表示のときだけ度分秒に戻す。
//
// 【精度について】取込時の変換（dms()）は秒を丸めずそのまま計算に使っており、
// 逆に「度分秒は必ず整数」という前提もない。DB側はDecimal(9,6)＝10進度で
// 小数点以下6桁（赤道上で約11cm相当）の精度を持つため、逆変換した秒を
// 整数に丸めると誤差が緯度なら最大約15m相当に広がってしまう。表示の見やすさと
// 精度のバランスを取り、秒は小数第1位までにしている（誤差はおおむね1m未満）。
function decimalDegreesToDms(decimalDegrees: number): { degrees: number; minutes: number; seconds: number } {
  const abs = Math.abs(decimalDegrees);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;
  return { degrees, minutes, seconds };
}

function formatDms(decimalDegrees: number): string {
  const { degrees, minutes, seconds } = decimalDegreesToDms(decimalDegrees);
  const mm = String(minutes).padStart(2, "0");
  const ss = seconds.toFixed(1).padStart(4, "0");
  return `${degrees}度${mm}分${ss}秒`;
}

/**
 * 緯度・経度（10進度）を、Excel様式と同じ度分秒表記の文字列にする
 * （例:「北緯35度16分34.4秒　東経133度08分05.6秒」）。
 * 日本国内のカルテ・点検調書のみを扱うため、北緯・東経固定でよい
 * （南緯・西経の符号処理は行わない）。
 */
export function formatLatLngDms(latitude: number, longitude: number): string {
  return `北緯${formatDms(latitude)}　東経${formatDms(longitude)}`;
}
