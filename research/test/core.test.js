import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJan } from '../src/core/jan.js';
import { calcProfit, judge } from '../src/core/profit.js';
import { research } from '../src/core/research.js';
import { parseKeepaProducts, createKeepaProvider } from '../src/core/providers/keepa.js';
import { parseCatalog, parseOffers, parseFees, createSpApiProvider } from '../src/core/providers/spapi.js';
import { createMockProvider } from '../src/core/providers/mock.js';
import { emptyInfo } from '../src/core/providers/info.js';
import { parseScanExport } from '../src/cli/input.js';
import { buildResultCsv } from '../src/cli/output.js';

const info = (over) => ({ ...emptyInfo('4901234567894', 'test'), found: true, ...over });

test('normalizeJan: チェックデジットと12桁の補正', () => {
  assert.equal(normalizeJan('4901234567894'), '4901234567894');
  assert.equal(normalizeJan('4901234567890'), null);
  assert.equal(normalizeJan('012345678905'), '0012345678905');
  assert.equal(normalizeJan('4902-1234'), null);
  assert.equal(normalizeJan('49012347'), '49012347');
});

test('calcProfit: Keepa形式（手数料率）', () => {
  const r = calcProfit({ purchasePrice: 1000, kind: '' }, info({ buyBoxPrice: 2000, referralFeeRate: 0.1, fbaFee: 300 }));
  assert.deepEqual([r.sellPrice, r.referralFee, r.fbaFee, r.profit], [2000, 200, 300, 500]);
  assert.equal(r.roi, 0.5);
  assert.equal(judge(r), '◎');
});

test('calcProfit: 手数料の最低額・送料・FBAなし', () => {
  const r = calcProfit({ purchasePrice: 100, kind: '' }, info({ newPrice: 200, referralFeeRate: 0.08, fbaFee: 300 }), { useFba: false, shippingPerItem: 20 });
  assert.deepEqual([r.sellPriceType, r.referralFee, r.fbaFee, r.profit], ['新品最安', 30, 0, 50]);
  assert.equal(judge(r), '△');
});

test('calcProfit: SP-API形式（手数料の金額）は見積もった値段のときだけ使う', () => {
  const sp = info({ buyBoxPrice: 3000, usedPrice: 2000, referralFee: 300, feeBasePrice: 3000, fbaFee: 400 });
  assert.equal(calcProfit({ purchasePrice: 1000, kind: '' }, sp).profit, 1300);
  const used = calcProfit({ purchasePrice: 1000, kind: 'used' }, sp);
  assert.equal(used.sellPriceType, '中古最安');
  assert.equal(used.profit, null); // 中古の値段では手数料が分からない
  assert.equal(judge(used), '?');
});

test('calcProfit: 仕入れ値がない・商品がないときは判定しない', () => {
  assert.equal(judge(calcProfit({ purchasePrice: null }, info({ buyBoxPrice: 2000, referralFeeRate: 0.1, fbaFee: 300 }))), '?');
  assert.equal(judge(calcProfit({ purchasePrice: 100 }, emptyInfo('4901234567894', 'test'))), '?');
  assert.equal(judge(calcProfit({ purchasePrice: 5000 }, info({ buyBoxPrice: 2000, referralFeeRate: 0.1, fbaFee: 300 }))), '×');
});

test('parseKeepaProducts: 価格・ランキング・手数料を読み、ランキングの良い商品を選ぶ', () => {
  const cur = (rank) => { const c = Array(19).fill(-1); c[0] = 1980; c[1] = 1900; c[3] = rank; c[18] = 1950; return c; };
  const products = [
    { asin: 'B0WORSE', title: 'x', eanList: ['4901234567894'], stats: { current: cur(90000) } },
    { asin: 'B0BEST', title: '商品', eanList: ['4901234567894'], stats: { current: cur(1200), salesRankDrops30: 25 }, referralFeePercentage: 10, fbaFees: { pickAndPackFee: 318 } },
  ];
  const m = parseKeepaProducts(['4901234567894', '0012345678905'], products);
  const a = m.get('4901234567894');
  assert.deepEqual([a.asin, a.buyBoxPrice, a.newPrice, a.usedPrice, a.amazonPrice, a.salesRank, a.rankDrops30, a.referralFeeRate, a.fbaFee],
    ['B0BEST', 1950, 1900, null, 1980, 1200, 25, 0.1, 318]);
  assert.equal(m.get('0012345678905').found, false);
});

test('keepa provider: 100件ごとに分けて問い合わせ、エラーを記録に残す', async () => {
  const urls = [];
  const fetch = async (url) => { urls.push(url); return { ok: true, json: async () => (urls.length === 1 ? { products: [], tokensLeft: 50 } : { error: { message: 'NOT_ENOUGH_TOKEN' } }) }; };
  const p = createKeepaProvider({ apiKey: 'k', fetch });
  const jans = Array.from({ length: 150 }, (_, i) => String(i));
  const m = await p.lookup(jans);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /domain=5&code=0,1,2/);
  assert.equal(m.get('149').error, 'Keepa エラー: NOT_ENOUGH_TOKEN');
});

test('SP-API の応答の読み取り', () => {
  assert.deepEqual(parseCatalog({ items: [{ asin: 'B0X', summaries: [{ itemName: '名前' }], salesRanks: [{ displayGroupRanks: [{ rank: 345 }] }] }] }),
    { asin: 'B0X', title: '名前', salesRank: 345 });
  assert.equal(parseCatalog({ items: [] }), null);
  const offers = parseOffers({ payload: { Summary: {
    BuyBoxPrices: [{ condition: 'New', LandedPrice: { Amount: 2480 } }],
    LowestPrices: [
      { condition: 'new', fulfillmentChannel: 'Amazon', LandedPrice: { Amount: 2500 } },
      { condition: 'new', fulfillmentChannel: 'Merchant', LandedPrice: { Amount: 2380 } },
      { condition: 'used', fulfillmentChannel: 'Merchant', LandedPrice: { Amount: 1500 } },
    ] } } });
  assert.deepEqual(offers, { buyBoxPrice: 2480, newPrice: 2380, usedPrice: 1500 });
  assert.deepEqual(parseFees({ payload: { FeesEstimateResult: { FeesEstimate: {
    TotalFeesEstimate: { Amount: 571 },
    FeeDetailList: [{ FeeType: 'ReferralFee', FinalFee: { Amount: 248 } }, { FeeType: 'FBAFees', FinalFee: { Amount: 323 } }] } } } }),
  { referralFee: 248, fbaFee: 323 });
});

test('spapi provider: 認証 → 商品検索 → 価格 → 手数料の順に呼ぶ', async () => {
  const calls = [];
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const fetch = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${new URL(url).pathname}`);
    if (url.includes('/auth/o2/token')) return reply({ access_token: 't', expires_in: 3600 });
    if (url.includes('/catalog/')) return reply({ items: [{ asin: 'B0X', summaries: [{ itemName: '名前' }] }] });
    if (url.includes('/offers')) return reply({ payload: { Summary: { BuyBoxPrices: [{ condition: 'New', LandedPrice: { Amount: 2000 } }] } } });
    return reply({ payload: { FeesEstimateResult: { FeesEstimate: { TotalFeesEstimate: { Amount: 500 }, FeeDetailList: [{ FeeType: 'ReferralFee', FinalFee: { Amount: 200 } }] } } } });
  };
  const p = createSpApiProvider({ clientId: 'a', clientSecret: 'b', refreshToken: 'c', fetch, minInterval: { catalog: 0, offers: 0, fees: 0 } });
  const a = (await p.lookup(['4901234567894'])).get('4901234567894');
  assert.deepEqual(calls, ['POST /auth/o2/token', 'GET /catalog/2022-04-01/items', 'GET /products/pricing/v0/items/B0X/offers', 'POST /products/fees/v0/items/B0X/feesEstimate']);
  assert.deepEqual([a.asin, a.buyBoxPrice, a.referralFee, a.fbaFee, a.feeBasePrice], ['B0X', 2000, 200, 300, 2000]);
});

test('入力：Expo版とPWA版のJSONを読める', () => {
  const expo = parseScanExport(JSON.stringify({ app: 'jan-scanner', format_version: 1, records: [{ jan: '4901234567894', product_name: 'お茶', store: 'A店', store_price: 98, scanned_at: '2026-10-11T01:00:00Z', scanned_at_local: '2026/10/11 10:00' }] }));
  assert.deepEqual(expo[0], { jan: '4901234567894', purchasePrice: 98, kind: '', storeName: 'A店', productName: 'お茶', scannedAt: '2026/10/11 10:00', note: '' });
  const pwa = parseScanExport('﻿' + JSON.stringify([{ id: 1, jan: '4901234567894', scanned_at: '2026-10-11T10:00:00+09:00', store_price: null, note: 'x', kind: 'used' }]));
  assert.deepEqual([pwa[0].purchasePrice, pwa[0].kind, pwa[0].note], [null, 'used', 'x']);
  assert.throws(() => parseScanExport('jan,price'), /JSON として読めません/);
});

test('research → CSV：同じJANは1回だけ問い合わせ、良い順に並ぶ', async () => {
  const mock = createMockProvider();
  let asked;
  const provider = { name: 'mock', lookup: (jans) => { asked = jans; return mock.lookup(jans); } };
  const rows = await research([
    { jan: '4901234567894', purchasePrice: 9999 },
    { jan: '4901234567894', purchasePrice: 100 },
    { jan: 'abc', purchasePrice: 100 },
  ], provider);
  assert.deepEqual(asked, ['4901234567894']);
  assert.deepEqual(rows.map((r) => r.verdict), ['×', '◎', '?']);
  assert.equal(rows[2].info.error, 'JANコードが正しくありません');
  const csv = buildResultCsv(rows);
  assert.ok(csv.startsWith('﻿判定,JAN,'));
  const lines = csv.trim().split('\r\n');
  assert.match(lines[1], /^◎,="4901234567894",/);
  assert.match(lines[2], /^\?,="abc",/);
  assert.match(lines[3], /^×,/);
});
