// フェーズ2：スマホのアプリから JAN を受け取り、Amazon の情報（ProductInfo）を返す小さなサーバー。
// Cloudflare Workers で動かす。Keepa・SP-API の呼び出しは research/src/core をそのまま使う。
// キー類はコードに書かず、Cloudflare の秘密の設定（secret）から env で受け取る。使い方は worker/README.md。

import { createProvider } from '../research/src/core/research.js';
import { normalizeJan } from '../research/src/core/jan.js';
import { emptyInfo } from '../research/src/core/providers/info.js';

const PROVIDERS = ['keepa', 'spapi', 'mock'];
const CACHE_SECONDS = 3600; // 同じ JAN は1時間、調べ直さない（Keepa のトークン・SP-API の回数の節約）

// 作った provider は使い回す（SP-API の認証トークンを毎回取り直さないため）
const providers = new Map();
function getProvider(name, env) {
  if (!providers.has(name)) providers.set(name, createProvider(name, env));
  return providers.get(name);
}

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || 'https://gekigotott-rgb.github.io').split(',').map((s) => s.trim());
  const origin = request.headers.get('origin');
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0],
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'x-access-code',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });

export async function handle(request, env, ctx = { waitUntil() {} }, cache = globalThis.caches?.default) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/lookup') return json({ error: 'ありません' }, 404, cors);

  // 合言葉（ACCESS_CODE）が合わない問い合わせには答えない。設定し忘れたときも答えない
  if (!env.ACCESS_CODE || request.headers.get('x-access-code') !== env.ACCESS_CODE) return json({ error: '合言葉が違います' }, 401, cors);

  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: 'all' });
    if (!success) return json({ error: '問い合わせが多すぎます。少し待ってください' }, 429, cors);
  }

  const jan = normalizeJan(url.searchParams.get('jan'));
  if (!jan) return json({ error: 'JANコードが正しくありません' }, 400, cors);
  const kind = url.searchParams.get('kind') === 'used' ? 'used' : 'new';
  const name = url.searchParams.get('provider') || env.PROVIDER || 'keepa';
  if (!PROVIDERS.includes(name)) return json({ error: `知らない調べ先です: ${name}` }, 400, cors);

  const cacheKey = new Request(`https://cache.jan-scanner/lookup?provider=${name}&jan=${jan}&kind=${kind}`);
  const hit = cache && (await cache.match(cacheKey));
  if (hit) return json(await hit.json(), 200, { ...cors, 'x-cache': 'hit' });

  let info, provider;
  try {
    provider = getProvider(name, env);
    info = (await provider.lookup([jan], { used: kind === 'used' ? new Set([jan]) : new Set() })).get(jan);
  } catch (e) {
    return json({ info: emptyInfo(jan, name, e.message) }, 200, cors); // キーが未設定など
  }
  const body = { info, kind, tokensLeft: provider.tokensLeft ?? null };
  // エラーでない結果だけ保存する（一時的な失敗を1時間残さないため）
  if (cache && !info.error) ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'cache-control': `max-age=${CACHE_SECONDS}` } })));
  return json(body, 200, cors);
}

export default { fetch: (request, env, ctx) => handle(request, env, ctx) };
