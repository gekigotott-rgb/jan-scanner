// 調べる処理の中心。PCのスクリプト（フェーズA）とサーバー（フェーズB）の両方から使う。

import { normalizeJan } from './jan.js';
import { calcProfit, judge } from './profit.js';
import { emptyInfo } from './providers/info.js';
import { createKeepaProvider } from './providers/keepa.js';
import { createSpApiProvider } from './providers/spapi.js';
import { createMockProvider } from './providers/mock.js';

/** 名前と環境変数（キー類）から provider を作る。env は process.env でも Workers の env でもよい */
export function createProvider(name, env = {}, options = {}) {
  switch (name) {
    case 'keepa':
      return createKeepaProvider({ apiKey: env.KEEPA_API_KEY, ...options });
    case 'spapi':
      return createSpApiProvider({
        clientId: env.SP_API_CLIENT_ID,
        clientSecret: env.SP_API_CLIENT_SECRET,
        refreshToken: env.SP_API_REFRESH_TOKEN,
        ...options,
      });
    case 'mock':
      return createMockProvider();
    default:
      throw new Error(`知らない provider です: ${name}（keepa / spapi / mock のどれか）`);
  }
}

/**
 * スキャン記録をまとめて調べ、1記録ごとに結果を返す。
 * records: [{ jan, purchasePrice, kind, ... }]（kind は 'new' / 'used' / 空）
 * 同じ JAN は1回だけ問い合わせる。
 */
export async function research(records, provider, settings = {}) {
  const jans = [...new Set(records.map((r) => normalizeJan(r.jan)).filter(Boolean))];
  const used = new Set(records.filter((r) => r.kind === 'used').map((r) => normalizeJan(r.jan)).filter(Boolean));
  const infos = jans.length ? await provider.lookup(jans, { used }) : new Map();
  return records.map((record) => {
    const jan = normalizeJan(record.jan);
    const info = jan ? infos.get(jan) ?? emptyInfo(jan, provider.name, '結果がありません') : emptyInfo(record.jan, provider.name, 'JANコードが正しくありません');
    const calc = calcProfit(record, info, settings);
    return { record, info, calc, verdict: judge(calc, settings) };
  });
}
