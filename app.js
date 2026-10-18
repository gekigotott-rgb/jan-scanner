const $ = (id) => document.getElementById(id);

// ---- 通知（音＋フラッシュ。バイブは対応端末のみ） ----
let audioCtx;
function beep(freq = 1200, times = 1) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; g.gain.value = 0.15;
      o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.15;
      o.start(t); o.stop(t + 0.09);
    }
  } catch (e) {}
}
// 初めて読んだコード：高い音1回・緑。読んだことがあるコード：低い音2回・橙
function notify(repeat) {
  if (repeat) beep(600, 2); else beep(1200, 1);
  if (navigator.vibrate) navigator.vibrate(repeat ? [60, 60, 60] : 60);
  const f = $('flash'); f.classList.toggle('repeat', !!repeat); f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), 80);
}

// ---- 画面切り替え ----
function show(name) {
  ['scan', 'list', 'settings'].forEach(n => {
    $('view-' + n).classList.toggle('active', n === name);
    $('tab-' + n).classList.toggle('active', n === name);
  });
  if (name !== 'scan') stopScan();
  if (name === 'list') renderList();
  if (name === 'settings') renderSettings();
}
$('tab-scan').onclick = () => show('scan');
$('tab-list').onclick = () => show('list');
$('tab-settings').onclick = () => show('settings');
const isActive = (name) => $('view-' + name).classList.contains('active');

// ---- スキャン ----
const fmtTime = (iso) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const yen = (n) => '¥' + Number(n).toLocaleString('ja-JP');
let scanCount = 0;

function ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '1分以内';
  if (m < 60) return `${m}分前`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}時間${m % 60}分前`;
  return `${Math.floor(m / (60 * 24))}日前`;
}

// ---- 新品 / 中古 ----
const KIND_LABEL = { new: '新品', used: '中古' };
let currentKind = 'new';
try { const k = localStorage.getItem('kind'); if (KIND_LABEL[k]) currentKind = k; } catch (e) {}
function syncKindSeg() {
  document.querySelectorAll('#kind-seg button').forEach(b => b.classList.toggle('on', b.dataset.kind === currentKind));
}
$('kind-seg').addEventListener('click', (e) => {
  const k = e.target.dataset.kind; if (!k) return;
  currentKind = k; syncKindSeg();
  try { localStorage.setItem('kind', k); } catch (e2) {}
});
syncKindSeg();
const kindTag = (k) => (KIND_LABEL[k] ? `<span class="ktag ${k}">${KIND_LABEL[k]}</span>` : '');

// ---- 店（いまいる店。記録ごとに店名を残す） ----
const loadPref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const savePref = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
let stores = loadPref('stores', []);
let currentStore = loadPref('currentStore', '');

function renderStoreSel() {
  const names = stores.includes(currentStore) || !currentStore ? stores : [...stores, currentStore];
  $('store-sel').innerHTML = '<option value="">店：未設定</option>'
    + names.map(n => `<option value="${esc(n)}"${n === currentStore ? ' selected' : ''}>店：${esc(n)}</option>`).join('')
    + '<option value="__add">＋ 店を追加…</option>'
    + (currentStore ? `<option value="__remove">－「${esc(currentStore)}」を一覧から外す</option>` : '');
}
$('store-sel').addEventListener('change', () => {
  const v = $('store-sel').value;
  if (v === '__add') {
    const name = (prompt('店の名前（例：〇〇駅前店）') || '').trim();
    if (name) {
      if (!stores.includes(name)) { stores.push(name); savePref('stores', stores); }
      currentStore = name;
    }
  } else if (v === '__remove') {
    // 一覧から外すだけ。これまでの記録の店名は残る
    if (confirm(`「${currentStore}」を店の一覧から外しますか？（これまでの記録はそのまま残ります）`)) {
      stores = stores.filter(n => n !== currentStore); savePref('stores', stores);
      currentStore = '';
    }
  } else currentStore = v;
  savePref('currentStore', currentStore);
  renderStoreSel();
});
renderStoreSel();

// ---- 価格入力 ON / OFF（OFF のときは読み取ったらすぐ価格なしで登録して、続けて読む） ----
let priceMode = loadPref('priceMode', true);
function syncPriceMode() {
  $('btn-price-mode').textContent = `価格入力 ${priceMode ? 'ON' : 'OFF'}`;
  $('btn-price-mode').classList.toggle('on', priceMode);
  $('scan-hint').textContent = priceMode
    ? '読み取ると価格入力パネルが出ます。値札がなければ「価格なしで登録」。'
    : '連続で読み取り、価格なしで登録します。同じコードは3秒間は無視します。';
}
$('btn-price-mode').onclick = () => { priceMode = !priceMode; savePref('priceMode', priceMode); syncPriceMode(); };
syncPriceMode();

// 最後に読んだ記録。Amazon の情報が届いたら、この枠に足して表示し直す
let lastScan = null; // { id, head }
let busy = false;    // パネルを閉じるまで次のコードを受け付けない

async function onScanned(jan) {
  if (busy) return;
  if (/^19[12]/.test(jan)) return; // 本の2段目のバーコード（値段と分類のコード）は商品のコードではない
  busy = true;
  try {
    const all = await DB.all();
    const before = all.filter(r => r.jan === jan); // 新しい順（今回の分を含まない）
    const repeat = before.length > 0;
    notify(repeat);
    const rec = { jan, kind: currentKind, store: currentStore };
    // 先に保存してから Amazon を調べる（電波がなくても記録は残る）。価格はパネルで入れる
    const id = await DB.add(rec);
    scanCount++;
    $('status').textContent = `読み取り中… 今回 ${scanCount}件（${KIND_LABEL[currentKind]}${currentStore ? '・' + currentStore : ''}）`;
    $('last').className = 'last ' + (repeat ? 'repeat' : 'fresh');
    lastScan = { id, head: `<div class="jan">${jan}${kindTag(currentKind)}</div>` + (repeat
      ? `<div class="tag">⚠ ${before.length + 1}回目（前回 ${KIND_LABEL[before[0].kind] ? KIND_LABEL[before[0].kind] + ' ' : ''}${fmtTime(before[0].scanned_at)}・${ago(before[0].scanned_at)}）</div>`
      : `<div class="tag">新規</div>`) };
    await renderLast();
    if (Price.enabled()) fetchAmazon(id);
    if (priceMode) openPanel(id, rec, before, all);
    else busy = false;
  } catch (e) { busy = false; }
}

// ---- 価格入力パネル ----
let pending = null; // { id, rec, hist }
let digits = '';

// 同じJAN・同じ種別の過去の価格（この店の前回／ほかの店の最安）
function priceHistory(all, rec) {
  const same = all.filter(r => r.jan === rec.jan && (r.kind || '') === (rec.kind || '') && r.store_price != null);
  const here = same.find(r => (r.store || '') === rec.store); // all は新しい順
  const best = same.filter(r => (r.store || '') !== rec.store)
    .reduce((m, r) => (!m || r.store_price < m.store_price ? r : m), null);
  return { here, best };
}

function openPanel(id, rec, before, all) {
  pending = { id, rec, hist: priceHistory(all, rec) };
  digits = '';
  $('p-jan').innerHTML = `${rec.jan}${kindTag(rec.kind)}`;
  $('p-sub').className = 'p-sub' + (before.length ? ' repeat' : '');
  $('p-sub').textContent = (before.length ? `⚠ ${before.length + 1}回目（前回 ${fmtTime(before[0].scanned_at)}）` : '新規')
    + ` ・ ${rec.store || '店：未設定'}`;
  const { here, best } = pending.hist;
  $('p-hist').innerHTML = [
    here ? `この店の前回 <b>${yen(here.store_price)}</b>（${fmtTime(here.scanned_at)}）` : '',
    best ? `ほかの店の最安 <b>${yen(best.store_price)}</b>（${esc(best.store || '店なし')}）` : '',
  ].filter(Boolean).join('<br>');
  $('p-amz').innerHTML = '';
  renderPrice();
  $('panel').hidden = false;
}

function renderPrice() {
  const price = digits ? Number(digits) : null;
  $('p-price').textContent = price != null ? yen(price) : '価格を入力';
  $('p-price').classList.toggle('empty', price == null);
  $('p-ok').disabled = !price;
  const { here, best } = pending.hist;
  const lines = [];
  if (price && best) {
    const d = price - best.store_price;
    lines.push(d < 0 ? `<span class="ok">ほかの店より ${yen(-d)} 安い！</span>`
      : d > 0 ? `<span class="warn">${esc(best.store || '店なし')}のほうが ${yen(d)} 安い</span>`
        : 'ほかの店の最安と同じ');
  }
  if (price && here && here.store_price !== price) {
    const d = price - here.store_price;
    lines.push(`<span class="${d < 0 ? 'ok' : 'warn'}">この店の前回から ${d < 0 ? '↓' : '↑'}${yen(Math.abs(d))}</span>`);
  }
  $('p-cmp').innerHTML = lines.join('<br>');
  renderPanelAmz();
}

// パネルにも Amazon の情報（仕入れ上限・打ち込んだ価格での利益）を出す
async function renderPanelAmz() {
  if (!pending || !Price.enabled()) return;
  const { id } = pending, typed = digits;
  const rec = await getRec(id);
  if (!rec) return;
  const html = await amazonHtml({ ...rec, store_price: typed ? Number(typed) : null });
  if (pending && pending.id === id && digits === typed) $('p-amz').innerHTML = html;
}

function closePanel() {
  $('panel').hidden = true;
  pending = null; digits = '';
  busy = false;
}

$('keypad').addEventListener('click', (e) => {
  const k = e.target.dataset.k; if (!k) return;
  if (k === 'del') digits = digits.slice(0, -1);
  else if (digits.length + k.length <= 7) digits = (digits + k).replace(/^0+/, '');
  renderPrice();
});
async function submitPanel(price) {
  if (!pending) return;
  const rec = await getRec(pending.id);
  if (rec && price != null) { rec.store_price = price; await DB.update(rec); }
  closePanel();
  renderLast();
}
$('p-ok').onclick = () => submitPanel(digits ? Number(digits) : null);
$('p-skip').onclick = () => submitPanel(null);
// 読み間違いなど。保存しておいた記録を消す
$('p-cancel').onclick = async () => {
  if (!pending) return;
  await DB.remove(pending.id);
  scanCount = Math.max(0, scanCount - 1);
  if (lastScan && lastScan.id === pending.id) { lastScan = null; $('last').className = 'last'; $('last').innerHTML = ''; }
  closePanel();
};

async function renderLast() {
  if (!lastScan) return;
  const shown = lastScan.id;
  const rec = await getRec(shown);
  const amz = rec && Price.enabled() ? await amazonHtml(rec) : '';
  if (!rec || !lastScan || lastScan.id !== shown) return;
  if (document.activeElement && document.activeElement.id === 'last-price') { // 入力中は打ち込んでいる欄を消さない
    const old = $('last').querySelector('.amz');
    if (old && amz) old.outerHTML = amz;
    return;
  }
  const input = Price.enabled()
    ? `<div class="quick"><input type="number" inputmode="numeric" min="0" placeholder="店頭価格(円)を入れると利益が出ます" id="last-price" value="${rec.store_price ?? ''}"></div>` : '';
  $('last').innerHTML = lastScan.head + amz + input;
}
$('last').addEventListener('change', async (e) => {
  if (e.target.id !== 'last-price' || !lastScan) return;
  const rec = await getRec(lastScan.id); if (!rec) return;
  rec.store_price = e.target.value === '' ? null : Number(e.target.value);
  rec.exported_at = null;
  await DB.update(rec);
  e.target.blur();
  renderLast();
});

// ---- Amazon の価格（フェーズ2） ----
const getRec = async (id) => (await DB.all()).find(r => r.id === id);
const fetching = new Map(); // id -> 'loading' または 取れなかった理由
const lookupKind = (r) => (r.kind === 'used' ? 'used' : 'new');
// 取り直しが要るか。SP-API は新品と中古で調べる中身が違うので、種別を変えたら取り直す
const needsFetch = (r) => !r.amazon || (r.amazon.source === 'spapi' && r.amazon.lookup_kind !== lookupKind(r));

async function fetchAmazon(id) {
  const rec = await getRec(id);
  if (!rec || !Price.enabled() || fetching.get(id) === 'loading') return;
  fetching.set(id, 'loading');
  refreshShown(id);
  const kind = lookupKind(rec);
  try {
    const info = await Price.lookup(rec.jan, kind);
    const latest = await getRec(id); // 待っている間に価格やメモが直されているかもしれない
    if (latest) {
      latest.amazon = { ...info, lookup_kind: kind, fetched_at: new Date().toISOString() };
      await DB.update(latest);
    }
    fetching.delete(id);
  } catch (e) {
    fetching.set(id, e.name === 'AbortError' ? '時間切れ' : (e.message || '通信できませんでした'));
  }
  refreshShown(id);
}
function refreshShown(id) {
  if (lastScan && lastScan.id === id) renderLast();
  if (pending && pending.id === id) renderPanelAmz();
  if (isActive('list')) renderList();
}

const VERDICT_CLASS = { '◎': 'good', '△': 'mid', '×': 'bad', '?': 'unk' };
async function amazonHtml(rec) {
  const state = fetching.get(rec.id);
  if (state === 'loading') return `<div class="amz loading">Amazonを調べています…</div>`;
  if (!rec.amazon) return `<div class="amz none">${state ? `Amazon：取得できませんでした（${esc(state)}）` : 'Amazon：未取得'}</div>`;
  const a = rec.amazon;
  if (!a.found) return `<div class="amz none">${esc(/^Amazon/.test(a.error || '') ? a.error : `Amazon：${a.error || '見つかりません'}`)}</div>`;
  const ev = await Price.evaluate(rec);
  const c = ev.calc;
  const facts = [
    c.sellPrice != null ? `販売 ${yen(c.sellPrice)}（${esc(c.sellPriceType)}）` : '販売価格：出品なし',
    a.salesRank != null ? `${Number(a.salesRank).toLocaleString('ja-JP')}位` : null,
    a.rankDrops30 != null ? `30日で約${a.rankDrops30}個` : null,
  ].filter(Boolean).join('・');
  const max = ev.maxPrice == null ? `<div class="max unk">仕入れ上限：計算できません</div>`
    : ev.maxPrice <= 0 ? `<div class="max bad">仕入れ上限：なし（どの値段でも基準に届きません）</div>`
    : `<div class="max">仕入れ上限 ${yen(ev.maxPrice)}</div>`;
  const profit = c.profit != null
    ? `<div class="profit ${VERDICT_CLASS[ev.verdict]}"><span class="verdict">${ev.verdict}</span> 利益 ${yen(c.profit)}${c.roi != null ? `（ROI ${Math.round(c.roi * 100)}%）` : ''}</div>` : '';
  return `<div class="amz">
    <div class="title">${esc(a.title || '（商品名なし）')}</div>
    <div class="facts">${facts}${a.amazonPrice != null ? ' <span class="warn-t">⚠ Amazon本体あり</span>' : ''}${a.source === 'mock' ? ' <span class="warn-t">お試しデータ</span>' : ''}</div>
    ${max}${profit}
    ${a.asin && a.source !== 'mock' ? `<a class="amz-link" href="https://www.amazon.co.jp/dp/${encodeURIComponent(a.asin)}" target="_blank" rel="noopener">Amazonで確かめる</a>` : ''}
  </div>`;
}

// 未取得の記録（電波がなかった・設定前に読んだ）をまとめて調べる
$('btn-fetch').onclick = async () => {
  const targets = (await DB.all()).filter(needsFetch);
  for (const r of targets) await fetchAmazon(r.id);
};

async function startScan() {
  $('status').textContent = 'カメラを起動しています…';
  try {
    await Scanner.start($('video'), onScanned);
    $('status').textContent = 'バーコードをかざしてください';
    $('btn-toggle').textContent = 'スキャン停止';
  } catch (e) {
    $('status').textContent = 'カメラを使えません：設定でSafari(またはこのアプリ)のカメラを許可してください';
    Scanner.stop();
  }
}
function stopScan() {
  Scanner.stop();
  $('btn-toggle').textContent = 'スキャン開始';
  $('status').textContent = '停止中';
}
$('btn-toggle').onclick = () => (Scanner.isRunning() ? stopScan() : startScan());
document.addEventListener('visibilitychange', () => { if (document.hidden && Scanner.isRunning()) stopScan(); });

// ---- 一覧 ----
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

let listFilter = 'all';
$('filter-seg').addEventListener('click', (e) => {
  const f = e.target.dataset.filter; if (!f) return;
  listFilter = f;
  document.querySelectorAll('#filter-seg button').forEach(b => b.classList.toggle('on', b.dataset.filter === f));
  renderList();
});

// 一覧で店を付け替えるときの選択肢（店の一覧＋その記録の店名）
function storeOptions(cur) {
  const names = new Set(stores);
  if (cur) names.add(cur);
  return '<option value="">店なし</option>'
    + [...names].map(n => `<option value="${esc(n)}"${n === (cur || '') ? ' selected' : ''}>${esc(n)}</option>`).join('');
}

let listRendering = Promise.resolve();
function renderList() { listRendering = listRendering.then(renderListNow, renderListNow); return listRendering; }
async function renderListNow() {
  const allRows = await DB.all();
  const rows = listFilter === 'all' ? allRows : allRows.filter(r => r.kind === listFilter);
  const kinds = new Set(rows.map(r => r.jan)).size;
  const times = {};
  allRows.forEach(r => { times[r.jan] = (times[r.jan] || 0) + 1; }); // ×N は新品・中古をまたいだ回数
  const fresh = allRows.filter(r => !r.exported_at).length;
  $('count').textContent = `${rows.length}件（${kinds}種類）`;
  $('unexp').textContent = fresh ? `未書き出し ${fresh}件` : 'すべて書き出し済み';
  $('empty').style.display = rows.length ? 'none' : 'block';
  const missing = Price.enabled() ? allRows.filter(needsFetch).length : 0;
  $('btn-fetch').style.display = missing ? '' : 'none';
  $('btn-fetch').textContent = `Amazon未取得 ${missing}件を調べる`;
  const amz = Price.enabled() ? await Promise.all(rows.map(amazonHtml)) : rows.map(() => '');
  // 入力中の欄があるときは、打ち込んでいる途中の値を消さないよう作り直さない
  if ($('list').contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  $('list').innerHTML = rows.map((r, i) => {
    // 同じJANで、同じ種別（新品どうし・中古どうし）の他の記録と店頭価格が違えば警告
    const diff = r.store_price == null ? [] :
      allRows.filter(o => o.jan === r.jan && o.id !== r.id && (o.kind || '') === (r.kind || '') && o.store_price != null && o.store_price !== r.store_price);
    const alertHtml = diff.length
      ? `<p class="alert">⚠ 過去の店頭価格と違います：${diff.map(o => `${yen(o.store_price)}（${o.store ? esc(o.store) + '・' : ''}${fmtTime(o.scanned_at)}）`).join('、')}</p>` : '';
    return `<li data-id="${r.id}" class="${diff.length ? 'warn' : ''}">
      <div class="item-head"><span class="jan">${esc(r.jan)}${kindTag(r.kind)}${times[r.jan] > 1 ? `<span class="badge">×${times[r.jan]}</span>` : ''}</span><span class="time">${fmtTime(r.scanned_at)}${r.exported_at ? ' ・ 書き出し済み' : ''}</span></div>
      ${alertHtml}
      ${amz[i]}
      <div class="fields">
        <input type="number" inputmode="numeric" min="0" placeholder="店頭価格(円)" data-f="store_price" value="${r.store_price ?? ''}">
        <input type="text" placeholder="メモ" data-f="note" value="${esc(r.note)}">
      </div>
      <div class="item-foot">
        <span class="selects">
        <select data-f="store">${storeOptions(r.store)}</select>
        <select data-f="kind">
          <option value=""${r.kind ? '' : ' selected'}>種別なし</option>
          <option value="new"${r.kind === 'new' ? ' selected' : ''}>新品</option>
          <option value="used"${r.kind === 'used' ? ' selected' : ''}>中古</option>
        </select>
        </span>
        <button class="danger" data-del="1">削除</button>
      </div>
    </li>`;
  }).join('');
}

$('list').addEventListener('change', async (e) => {
  const f = e.target.dataset.f; if (!f) return;
  const id = Number(e.target.closest('li').dataset.id);
  const rec = (await DB.all()).find(r => r.id === id); if (!rec) return;
  rec[f] = f === 'store_price' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
  rec.exported_at = null; // 書き出し後に価格やメモを直したら、次の書き出しに入れ直す
  await DB.update(rec);
  e.target.blur();
  renderList();
  if (f === 'kind' && Price.enabled() && needsFetch(rec)) fetchAmazon(id);
});
$('list').addEventListener('click', async (e) => {
  if (!e.target.dataset.del) return;
  if (!confirm('この記録を削除しますか？')) return;
  await DB.remove(Number(e.target.closest('li').dataset.id));
  renderList();
});

// ---- 書き出し（共有シート。使えなければダウンロード） ----
// 書き出しは日本時間(JST, UTC+9)。端末内の保存値はUTCのまま
const JST_MS = 9 * 60 * 60 * 1000;
const toJst = (iso) => new Date(new Date(iso).getTime() + JST_MS).toISOString(); // 見た目がJSTのISO文字列

async function buildExport(kind, rows, now = new Date()) {
  const j = toJst(now.toISOString());
  const stamp = j.slice(0, 10) + '_' + j.slice(11, 16).replace(':', ''); // 例: 2026-09-28_1241（同じ日に何度書き出しても名前が重ならない）
  if (kind === 'json') {
    const data = rows.map(r => ({ ...r, scanned_at: toJst(r.scanned_at).slice(0, 19) + '+09:00',
      exported_at: r.exported_at ? toJst(r.exported_at).slice(0, 19) + '+09:00' : null }));
    return { body: JSON.stringify(data, null, 2), type: 'application/json', name: `jan-scan_${stamp}.json` };
  }
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  // 追加の列は末尾に足す（既存の列の並びは変えない）。Amazon の列は、調べた記録だけ埋まる
  const lines = [];
  for (const r of rows) {
    const a = r.amazon && r.amazon.found ? r.amazon : null;
    const ev = a ? await Price.evaluate(r) : null;
    lines.push([r.id, q(r.jan), toJst(r.scanned_at).slice(0, 19).replace('T', ' '), r.store_price ?? '', q(r.note), KIND_LABEL[r.kind] || '',
      q(a?.title), ev?.calc.sellPrice ?? '', ev?.maxPrice ?? '', ev?.calc.profit ?? '', a ? ev.verdict : '', q(a?.asin), a?.salesRank ?? '', q(r.store)].join(','));
  }
  const body = '﻿' + ['id,jan,scanned_at_jst,store_price,note,kind,amazon_title,amazon_sell_price,max_purchase_price,profit,verdict,asin,sales_rank,store',
    ...lines].join('\r\n');
  return { body, type: 'text/csv', name: `jan-scan_${stamp}.csv` };
}

// 通常は「未書き出し」の記録だけを書き出す。成功したら書き出し済みの印(exported_at)を付ける。履歴は消さない
async function exportFile(kind) {
  const all = (await DB.all()).reverse();
  const includeAll = $('chk-all').checked;
  const rows = includeAll ? all : all.filter(r => !r.exported_at);
  if (!all.length) return alert('書き出す記録がありません');
  if (!rows.length) return alert('新しい記録はありません。すべて書き出し済みです。\n（全件を書き出すときは、下のチェックを入れてください）');
  const { body, type, name } = await buildExport(kind, rows);
  const file = new File([body], name, { type });
  let done = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); done = true; }
    catch (e) { if (e.name === 'AbortError') return; } // 途中でやめたときは印を付けない
  }
  if (!done) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const at = new Date().toISOString();
  for (const r of rows) if (!r.exported_at) { r.exported_at = at; await DB.update(r); }
  renderList();
}
$('btn-csv').onclick = () => exportFile('csv');
$('btn-json').onclick = () => exportFile('json');

// ---- 保存済みの12桁コードを13桁(先頭に0)へ直す（一度直せば何もしない） ----
(async () => {
  try {
    for (const r of await DB.all()) {
      const n = Scanner.normalize(r.jan);
      if (n !== r.jan) { r.jan = n; await DB.update(r); }
    }
  } catch (e) {}
})();

// ---- 設定（Amazon の価格・仕入れ判定の基準） ----
function renderSettings() {
  const s = Price.settings;
  document.querySelectorAll('#prov-seg button').forEach(b => b.classList.toggle('on', b.dataset.p === s.provider));
  $('server-fields').style.display = ['keepa', 'spapi'].includes(s.provider) ? '' : 'none';
  $('set-url').value = s.apiUrl;
  $('set-code').value = s.accessCode;
  $('set-fba').checked = !!s.useFba;
  $('set-profit').value = s.minProfit;
  $('set-roi').value = Math.round(s.minRoi * 100);
  $('set-ship').value = s.shippingPerItem;
  $('set-other').value = s.otherCostPerItem;
}
$('prov-seg').addEventListener('click', (e) => {
  const p = e.target.dataset.p; if (!p) return;
  Price.save({ provider: p }); renderSettings();
  $('test-result').textContent = '';
});
$('view-settings').addEventListener('change', (e) => {
  if (!e.target.id.startsWith('set-')) return;
  const num = (id, d) => { const v = Number($(id).value); return $(id).value === '' || !Number.isFinite(v) ? d : v; };
  Price.save({
    apiUrl: $('set-url').value.trim(), accessCode: $('set-code').value.trim(), useFba: $('set-fba').checked,
    minProfit: num('set-profit', 300), minRoi: num('set-roi', 15) / 100, shippingPerItem: num('set-ship', 0), otherCostPerItem: num('set-other', 0),
  });
});
$('btn-test').onclick = async () => {
  if (!Price.enabled()) { $('test-result').textContent = '調べ先・URL・合言葉を入れてください'; return; }
  $('test-result').textContent = '試しています…';
  try {
    const info = await Price.lookup('4902102072618', 'new'); // 試しに調べるJAN（Amazonになくても、つながれば理由が返る）
    $('test-result').textContent = info.found ? `つながりました：${info.title || info.asin}` : `つながりました（${info.error || '商品なし'}）`;
  } catch (e) {
    $('test-result').textContent = `つながりません：${e.name === 'AbortError' ? '時間切れ' : e.message}`;
  }
};

// ---- オフライン用 ----
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // 新しいバージョンに切り替わったら、一度だけ読み込み直す（更新を反映するため）
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
