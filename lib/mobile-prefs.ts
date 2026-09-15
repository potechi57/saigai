// 現場向け画面（/m）の、端末ごとの表示・検索設定（localStorageのみに保存。
// ログイン機能が無いMVPのため、サーバー側には一切保存しない）。
// 設定画面（app/m/settings/page.tsx）と、実際に使う側（NearbySearchButton・
// app/m/page.tsx等）の両方から参照するため、ここに集約する。

const NEARBY_RADIUS_KEY = "mobileNearbyRadiusM";
export const NEARBY_RADIUS_OPTIONS_M = [500, 1000, 2000, 3000] as const;
export const DEFAULT_NEARBY_RADIUS_M = 1000;

// 現在地検索の半径（会話ログ「現在地検索の半径変更」）。
export function readNearbyRadiusM(): number {
  try {
    const raw = localStorage.getItem(NEARBY_RADIUS_KEY);
    const n = raw ? Number(raw) : NaN;
    return (NEARBY_RADIUS_OPTIONS_M as readonly number[]).includes(n) ? n : DEFAULT_NEARBY_RADIUS_M;
  } catch {
    return DEFAULT_NEARBY_RADIUS_M;
  }
}

export function writeNearbyRadiusM(radiusM: number): void {
  try {
    localStorage.setItem(NEARBY_RADIUS_KEY, String(radiusM));
  } catch {
    // localStorageが使えない環境では諦める（次回既定値に戻るだけ）
  }
}

export function formatRadiusLabel(radiusM: number): string {
  return radiusM >= 1000 ? `${radiusM / 1000}km` : `${radiusM}m`;
}
