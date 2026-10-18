// フェーズ2：Amazon の価格を調べる。
// 調べ先は設定画面で選ぶ：Keepa / SP-API（どちらも自分のサーバー worker/ 経由）、お試し（端末内の架空データ）。
// APIキーはスマホに置かない。スマホが持つのはサーバーのURLと合言葉だけ。
// 利益の計算は research/src/core/profit.js をそのまま使う（PC版と同じ判定になる）。
//
// Price.lookup(jan, kind) => Promise<ProductInfo>（research/src/core/providers/info.js の形）
// 通信できなかったときは例外を投げる（記録は「未取得」のまま残る）。
const Price = (() => {
  const KEY = 'price-settings';
  const DEFAULTS = {
    provider: 'off',        // off（使わない）/ keepa / spapi / mock（お試し）
    apiUrl: '',             // 例：https://jan-scanner-api.xxxx.workers.dev
    accessCode: '',
    useFba: true,
    shippingPerItem: 0,
    otherCostPerItem: 0,
    minProfit: 300,
    minRoi: 0.15,
  };
  const TIMEOUT_MS = 20000;

  let settings = { ...DEFAULTS };
  try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) {}

  // core の部品は必要になったときに読み込む（ES モジュール）
  const profitMod = () => import('./research/src/core/profit.js');
  const mockMod = () => import('./research/src/core/providers/mock.js');

  // 調べるのは1件ずつ順番に（続けて読んだときに API の上限を超えないように）
  let queue = Promise.resolve();

  async function fetchInfo(jan, kind) {
    if (settings.provider === 'mock') {
      await new Promise(r => setTimeout(r, 400));
      return (await (await mockMod()).createMockProvider().lookup([jan])).get(jan);
    }
    const url = `${settings.apiUrl.replace(/\/+$/, '')}/lookup?jan=${encodeURIComponent(jan)}&kind=${kind === 'used' ? 'used' : 'new'}&provider=${settings.provider}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { 'x-access-code': settings.accessCode }, signal: ctl.signal, cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `サーバーのエラー(${res.status})`);
      return body.info;
    } finally { clearTimeout(timer); }
  }

  return {
    get settings() { return { ...settings }; },
    save(next) {
      settings = { ...settings, ...next };
      try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
    },
    /** 調べられる設定になっているか */
    enabled() { return settings.provider === 'mock' || (['keepa', 'spapi'].includes(settings.provider) && !!settings.apiUrl && !!settings.accessCode); },
    lookup(jan, kind) {
      const run = queue.then(() => fetchInfo(jan, kind));
      queue = run.catch(() => {});
      return run;
    },
    /** 利益・判定・仕入れ上限。店頭価格がなければ利益は null */
    async evaluate(rec) {
      const { calcProfit, judge, maxPurchasePrice } = await profitMod();
      const info = rec.amazon;
      if (!info) return null;
      const calc = calcProfit({ purchasePrice: rec.store_price, kind: rec.kind }, info, settings);
      return { calc, verdict: judge(calc, settings), maxPrice: maxPurchasePrice(rec.kind, info, settings) };
    },
  };
})();
