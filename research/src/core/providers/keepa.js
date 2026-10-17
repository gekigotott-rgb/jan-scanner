// Keepa API で JAN から Amazon.co.jp の商品情報を調べる。
// https://keepa.com/#!discuss/t/product-object/116
// 1回の問い合わせで最大100個の JAN をまとめて調べられる。トークン（Keepaの利用量）を消費する。

import { emptyInfo } from './info.js';

const DOMAIN_JP = 5;
const BATCH = 100;
// stats.current の並び（Keepa の csv 種別）
const CSV_AMAZON = 0, CSV_NEW = 1, CSV_USED = 2, CSV_SALES_RANK = 3, CSV_BUY_BOX = 18;

const price = (v) => (Number.isFinite(v) && v > 0 ? v : null); // Keepa は「なし」を -1 で返す

/** Keepa の応答（products の配列）を、JAN ごとの ProductInfo にする */
export function parseKeepaProducts(jans, products = []) {
  const result = new Map();
  for (const jan of jans) {
    // 同じ JAN に複数の商品ページがあることがある。ランキングが一番良いものを選ぶ
    const matches = products.filter((p) => (p.eanList || []).includes(jan) || (p.upcList || []).some((u) => '0' + u === jan));
    const rankOf = (p) => price(p.stats?.current?.[CSV_SALES_RANK]) ?? Infinity;
    const p = matches.sort((a, b) => rankOf(a) - rankOf(b))[0];
    if (!p) { result.set(jan, emptyInfo(jan, 'keepa', 'Amazonに商品が見つかりません')); continue; }

    const cur = p.stats?.current || [];
    const feePercent = p.referralFeePercent ?? p.referralFeePercentage;
    result.set(jan, {
      ...emptyInfo(jan, 'keepa'),
      found: true,
      asin: p.asin,
      title: p.title ?? null,
      buyBoxPrice: price(p.stats?.buyBoxPrice) ?? price(cur[CSV_BUY_BOX]),
      newPrice: price(cur[CSV_NEW]),
      usedPrice: price(cur[CSV_USED]),
      amazonPrice: price(cur[CSV_AMAZON]),
      salesRank: price(cur[CSV_SALES_RANK]),
      rankDrops30: Number.isFinite(p.stats?.salesRankDrops30) && p.stats.salesRankDrops30 >= 0 ? p.stats.salesRankDrops30 : null,
      referralFeeRate: Number.isFinite(feePercent) && feePercent > 0 ? feePercent / 100 : null,
      fbaFee: price(p.fbaFees?.pickAndPackFee),
    });
  }
  return result;
}

export function createKeepaProvider({ apiKey, fetch = globalThis.fetch, baseUrl = 'https://api.keepa.com' }) {
  if (!apiKey) throw new Error('KEEPA_API_KEY が設定されていません');
  return {
    name: 'keepa',
    async lookup(jans) {
      const result = new Map();
      for (let i = 0; i < jans.length; i += BATCH) {
        const chunk = jans.slice(i, i + BATCH);
        const url = `${baseUrl}/product?key=${encodeURIComponent(apiKey)}&domain=${DOMAIN_JP}&code=${chunk.join(',')}&stats=90`;
        const res = await fetch(url);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) {
          const msg = `Keepa エラー: ${json.error?.message || res.status}`;
          for (const jan of chunk) result.set(jan, emptyInfo(jan, 'keepa', msg));
          continue;
        }
        for (const [jan, info] of parseKeepaProducts(chunk, json.products)) result.set(jan, info);
        this.tokensLeft = json.tokensLeft;
      }
      return result;
    },
  };
}
