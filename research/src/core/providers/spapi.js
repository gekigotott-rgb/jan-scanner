// Amazon SP-API（出品者向けの公式API）で JAN から商品情報を調べる。
// 必要なもの：大口出品の契約と、開発者登録で発行される client id / client secret / refresh token。
// 2023年10月以降、AWS署名は不要になったため、アクセストークンだけで呼べる。
//
// 1件につき3回呼ぶ（商品検索 → 出品価格 → 手数料見積もり）。
// 出品価格の API は 0.5回/秒までなので、100件で3〜4分かかる。

import { emptyInfo } from './info.js';

export const JP_MARKETPLACE_ID = 'A1VC38T7YXB528';
const FE_ENDPOINT = 'https://sellingpartnerapi-fe.amazon.com';
const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
// API ごとの呼び出し間隔（ミリ秒）。Amazon の上限より少し余裕を持たせる
const MIN_INTERVAL = { catalog: 600, offers: 2100, fees: 1100 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const amount = (m) => (m && Number.isFinite(Number(m.Amount)) ? Math.round(Number(m.Amount)) : null);

/** 商品検索（Catalog Items 2022-04-01）の応答から ASIN・商品名・ランキングを取り出す */
export function parseCatalog(json) {
  const item = json?.items?.[0];
  if (!item) return null;
  const ranks = item.salesRanks?.[0];
  const rank = ranks?.displayGroupRanks?.[0]?.rank ?? ranks?.classificationRanks?.[0]?.rank ?? null;
  return { asin: item.asin, title: item.summaries?.[0]?.itemName ?? null, salesRank: rank };
}

/** 出品価格（getItemOffers）の応答から、カート価格と新品・中古の最安値を取り出す */
export function parseOffers(json) {
  const summary = json?.payload?.Summary || {};
  const cond = (o) => String(o.condition || o.Condition || '').toLowerCase();
  const landed = (o) => amount(o.LandedPrice) ?? amount(o.ListingPrice);
  const lowest = (c) => {
    const prices = (summary.LowestPrices || []).filter((o) => cond(o) === c).map(landed).filter((v) => v != null);
    return prices.length ? Math.min(...prices) : null;
  };
  const buyBox = (summary.BuyBoxPrices || []).find((o) => cond(o) === 'new');
  return { buyBoxPrice: buyBox ? landed(buyBox) : null, newPrice: lowest('new'), usedPrice: lowest('used') };
}

/** 手数料見積もり（getMyFeesEstimateForASIN）の応答から、販売手数料とそれ以外（FBA手数料など）を取り出す */
export function parseFees(json) {
  const est = json?.payload?.FeesEstimateResult?.FeesEstimate;
  if (!est) return null;
  const total = amount(est.TotalFeesEstimate);
  const referral = amount((est.FeeDetailList || []).find((f) => f.FeeType === 'ReferralFee')?.FinalFee);
  if (total == null || referral == null) return null;
  return { referralFee: referral, fbaFee: total - referral };
}

export function createSpApiProvider({
  clientId, clientSecret, refreshToken,
  fetch = globalThis.fetch,
  endpoint = FE_ENDPOINT,
  marketplaceId = JP_MARKETPLACE_ID,
  isAmazonFulfilled = true,
  minInterval = MIN_INTERVAL,
}) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('SP_API_CLIENT_ID / SP_API_CLIENT_SECRET / SP_API_REFRESH_TOKEN が設定されていません');
  }
  let token = null, tokenExpires = 0;
  const lastCall = {};

  async function accessToken() {
    if (token && Date.now() < tokenExpires) return token;
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw new Error(`SP-API の認証に失敗しました: ${json.error_description || res.status}`);
    token = json.access_token;
    tokenExpires = Date.now() + (json.expires_in - 60) * 1000;
    return token;
  }

  // 呼び出し間隔を守り、429（呼びすぎ）のときは待ってやり直す
  async function call(kind, path, init = {}) {
    for (let attempt = 0; ; attempt++) {
      const wait = (lastCall[kind] || 0) + minInterval[kind] - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall[kind] = Date.now();
      const res = await fetch(endpoint + path, {
        ...init,
        headers: { 'x-amz-access-token': await accessToken(), 'content-type': 'application/json', ...init.headers },
      });
      if (res.status === 429 && attempt < 3) { await sleep(2000 * 2 ** attempt); continue; }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`SP-API エラー(${kind}): ${json.errors?.[0]?.message || res.status}`);
      return json;
    }
  }

  async function lookupOne(jan) {
    const q = new URLSearchParams({ identifiers: jan, identifiersType: 'JAN', marketplaceIds: marketplaceId, includedData: 'summaries,salesRanks' });
    const catalog = parseCatalog(await call('catalog', `/catalog/2022-04-01/items?${q}`));
    if (!catalog) return emptyInfo(jan, 'spapi', 'Amazonに商品が見つかりません');

    const info = { ...emptyInfo(jan, 'spapi'), found: true, ...catalog };
    const oq = new URLSearchParams({ MarketplaceId: marketplaceId, ItemCondition: 'New', CustomerType: 'Consumer' });
    Object.assign(info, parseOffers(await call('offers', `/products/pricing/v0/items/${catalog.asin}/offers?${oq}`)));

    const basePrice = info.buyBoxPrice ?? info.newPrice;
    if (basePrice != null) {
      const fees = parseFees(await call('fees', `/products/fees/v0/items/${catalog.asin}/feesEstimate`, {
        method: 'POST',
        body: JSON.stringify({
          FeesEstimateRequest: {
            MarketplaceId: marketplaceId,
            IsAmazonFulfilled: isAmazonFulfilled,
            PriceToEstimateFees: { ListingPrice: { CurrencyCode: 'JPY', Amount: basePrice } },
            Identifier: `${jan}-${Date.now()}`,
          },
        }),
      }));
      if (fees) Object.assign(info, fees, { feeBasePrice: basePrice });
    }
    return info;
  }

  return {
    name: 'spapi',
    async lookup(jans) {
      const result = new Map();
      for (const jan of jans) {
        try { result.set(jan, await lookupOne(jan)); }
        catch (e) { result.set(jan, emptyInfo(jan, 'spapi', e.message)); }
      }
      return result;
    },
  };
}
