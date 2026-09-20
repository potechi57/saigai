// 画像アップロード等、件数が多くなりうる非同期処理をPromise.allでまとめて
// 発行すると、1点検調書あたり100件を超える損傷写真（会話ログ「橋梁の点検調書を
// 取り込もうとおもいエクセルを読み込ませましたが、解析・登録中から進みません」
// 参照。実データ確認済み: 大渡橋・福頼橋は損傷写真が120件超）で同時に100件超の
// HTTPリクエストを発行することになり、ネットワーク状況によっては応答が極端に
// 遅くなる・スタックして見える原因になりうる。同時実行数を絞ることで、
// 全体の処理時間は多少延びるが、1件あたりの応答性・失敗時の切り分けやすさを
// 優先する。
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
