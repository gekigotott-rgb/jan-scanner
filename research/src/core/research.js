// 調べる処理の中心。PCのスクリプト（フェーズA）とサーバー（フェーズB）の両方から使う。

import { normalizeJan } from './jan.js';
import { calcProfit, judge, DEFAULT_SETTINGS } from './profit.js';
import { emptyInfo } from './providers/info.js';
import { createKeepaProvider } from './providers/keepa.js';
import { createSpApiProvider } from './providers/spapi.js';
import { createMockProvider } from './providers/mock.js';
import { createNoneProvider } from './providers/none.js';

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
    case 'none':
      return createNoneProvider();
    default:
      throw new Error(`知らない provider です: ${name}（none / keepa / spapi / mock のどれか）`);
  }
}

/**
 * 手で入力した値（record.manualSellPrice / manualFbaFee）を、調べた結果より優先して使う。
 * 手数料が分からないところは設定の目安で埋める。
 */
export function applyManual(info, record, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (record.manualSellPrice == null && record.manualFbaFee == null) return info;
  const out = { ...info };
  if (record.manualFbaFee != null) out.fbaFee = record.manualFbaFee;
  if (record.manualSellPrice != null) {
    out.found = true;
    out.error = null;
    out.manualPrice = record.manualSellPrice;
    out.source = info.source === 'none' ? '手入力' : `${info.source}+手入力`;
    if (out.referralFeeRate == null) out.referralFeeRate = s.defaultReferralFeeRate;
    if (out.fbaFee == null) out.fbaFee = s.defaultFbaFee;
  }
  return out;
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
    const looked = jan ? infos.get(jan) ?? emptyInfo(jan, provider.name, '結果がありません') : emptyInfo(record.jan, provider.name, 'JANコードが正しくありません');
    const info = jan ? applyManual(looked, record, settings) : looked;
    const calc = calcProfit(record, info, settings);
    return { record, info, calc, verdict: judge(calc, settings) };
  });
}
