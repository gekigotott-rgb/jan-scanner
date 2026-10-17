// お試し用。API キーがなくても流れを確かめられるよう、JAN から決まった架空の数字を返す。
// 実在の価格ではない。

import { emptyInfo } from './info.js';

export function createMockProvider() {
  return {
    name: 'mock',
    async lookup(jans) {
      const result = new Map();
      for (const jan of jans) {
        const n = Number(jan.slice(-4));
        if (n % 7 === 0) { result.set(jan, emptyInfo(jan, 'mock', 'Amazonに商品が見つかりません（お試しデータ）')); continue; }
        const price = 500 + (n % 50) * 100;
        result.set(jan, {
          ...emptyInfo(jan, 'mock'),
          found: true,
          asin: `B0MOCK${jan.slice(-4)}`,
          title: `お試し商品 ${jan.slice(-4)}`,
          buyBoxPrice: price,
          newPrice: price - 20,
          usedPrice: Math.round(price * 0.6),
          amazonPrice: n % 3 === 0 ? price : null,
          salesRank: 1000 + (n % 97) * 500,
          rankDrops30: n % 40,
          referralFeeRate: 0.1,
          fbaFee: 318,
        });
      }
      return result;
    },
  };
}
