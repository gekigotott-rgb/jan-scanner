import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../index.js';

const env = { ACCESS_CODE: 'aikotoba', PROVIDER: 'mock' };
const req = (path, headers = { 'x-access-code': 'aikotoba', origin: 'https://gekigotott-rgb.github.io' }, method = 'GET') =>
  new Request(`https://api.example.com${path}`, { method, headers });

// Workers の caches.default の代わり
function memoryCache() {
  const m = new Map();
  return { m, match: async (r) => m.get(r.url)?.clone(), put: async (r, res) => { m.set(r.url, res); } };
}

test('合言葉がない・違う問い合わせには答えない', async () => {
  assert.equal((await handle(req('/lookup?jan=4901234567894', {}), env)).status, 401);
  assert.equal((await handle(req('/lookup?jan=4901234567894', { 'x-access-code': 'x' }), env)).status, 401);
  assert.equal((await handle(req('/lookup?jan=4901234567894'), { PROVIDER: 'mock' })).status, 401); // 合言葉を設定し忘れたとき
});

test('mock で調べて ProductInfo を返し、2回目は保存した結果を使う', async () => {
  const cache = memoryCache();
  const res = await handle(req('/lookup?jan=4901234567894&kind=used'), env, undefined, cache);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://gekigotott-rgb.github.io');
  const body = await res.json();
  assert.equal(body.kind, 'used');
  assert.equal(body.info.found, true);
  assert.equal(body.info.source, 'mock');
  const again = await handle(req('/lookup?jan=4901234567894&kind=used'), env, undefined, cache);
  assert.equal(again.headers.get('x-cache'), 'hit');
  assert.deepEqual(await again.json(), body);
});

test('JAN・調べ先・道がおかしいときと、事前確認（OPTIONS）', async () => {
  assert.equal((await handle(req('/lookup?jan=123'), env)).status, 400);
  assert.equal((await handle(req('/lookup?jan=4901234567894&provider=rakuten'), env)).status, 400);
  assert.equal((await handle(req('/other'), env)).status, 404);
  const pre = await handle(req('/lookup', { origin: 'https://gekigotott-rgb.github.io' }, 'OPTIONS'), env);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers'), /x-access-code/);
});

test('キーが未設定なら、理由をエラーとして返す（保存しない）', async () => {
  const cache = memoryCache();
  const body = await (await handle(req('/lookup?jan=4901234567894&provider=keepa'), env, undefined, cache)).json();
  assert.equal(body.info.found, false);
  assert.match(body.info.error, /KEEPA_API_KEY/);
  assert.equal(cache.m.size, 0);
});

test('使いすぎ防止の上限を超えたら 429', async () => {
  const res = await handle(req('/lookup?jan=4901234567894'), { ...env, LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal(res.status, 429);
});
