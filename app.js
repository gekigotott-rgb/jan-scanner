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
  ['scan', 'list', 'compare', 'settings'].forEach(n => {
    $('view-' + n).classList.toggle('active', n === name);
    $('tab-' + n).classList.toggle('active', n === name);
  });
  if (name !== 'scan') stopScan();
  if (name === 'list') renderList();
  if (name === 'compare') renderCompare();
  if (name === 'settings') renderSettings();
}
$('tab-scan').onclick = () => show('scan');
$('tab-list').onclick = () => show('list');
$('tab-compare').onclick = () => show('compare');
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
  // 読んだ瞬間の映像を1枚撮っておく（値札のバーコードを読めば値札が写る）。価格なしで登録したときだけ残す
  const snap = priceMode ? grabFrame() : null;
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
    if (priceMode) { openPanel(id, rec, before, all); if (snap) setPendingPhoto(snap); }
    else busy = false;
  } catch (e) { busy = false; }
}

// ---- 価格入力パネル ----
let pending = null; // { id, rec, hist }
let digits = '';

// ---- 税率と税込/税別。店頭価格はいつも税込で保存し、税別で打ったときは元の金額と税率も残す ----
const TAX_INCLUDED = 'tax_included', TAX_EXCLUDED = 'tax_excluded';
let taxRate = 10, priceBasis = TAX_INCLUDED;
// 税別の金額を税込にする（1円未満は切り捨て）
const withTax = (amount, rate) => Math.floor(amount * (100 + rate) / 100);
// パネルで打った金額を税込にしたもの。未入力なら null
const panelPrice = () => (digits ? (priceBasis === TAX_EXCLUDED ? withTax(Number(digits), taxRate) : Number(digits)) : null);
function syncTaxSeg() {
  document.querySelectorAll('#p-rate button').forEach(b => b.classList.toggle('on', Number(b.dataset.rate) === taxRate));
  document.querySelectorAll('#p-basis button').forEach(b => b.classList.toggle('on', b.dataset.basis === priceBasis));
}
$('p-rate').addEventListener('click', (e) => { if (!e.target.dataset.rate) return; taxRate = Number(e.target.dataset.rate); syncTaxSeg(); renderPrice(); });
$('p-basis').addEventListener('click', (e) => { if (!e.target.dataset.basis) return; priceBasis = e.target.dataset.basis; syncTaxSeg(); renderPrice(); });
// 一覧などで価格を直接直したときは、税別で打った情報を消す（税込の金額として扱う）
function setPlainPrice(rec, price) {
  rec.store_price = price;
  rec.price_basis = price == null ? null : TAX_INCLUDED;
  rec.entered_price = price;
}
const taxNote = (r) => (r.price_basis === TAX_EXCLUDED && r.entered_price != null ? `税別${yen(r.entered_price)}・${r.tax_rate}%` : '');

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
  // 税率は「その商品で前回選んだもの」、税込/税別は「その店で前回選んだもの」（店によって値札の書き方が違うため）
  taxRate = all.find(r => r.jan === rec.jan && r.tax_rate)?.tax_rate ?? 10;
  priceBasis = all.find(r => (r.store || '') === rec.store && r.price_basis)?.price_basis ?? TAX_INCLUDED;
  syncTaxSeg();
  $('p-thumb').hidden = true; $('p-thumb').removeAttribute('src');
  $('p-photo-note').textContent = '';
  $('p-photo').textContent = '📷 値札を撮る';
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
  const price = panelPrice();
  $('p-entered').textContent = price != null && priceBasis === TAX_EXCLUDED ? `税別 ${yen(Number(digits))} ＋ 消費税${taxRate}%（税込で登録）` : '';
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
  const { id } = pending, typed = panelPrice();
  const rec = await getRec(id);
  if (!rec) return;
  const html = await amazonHtml({ ...rec, store_price: typed });
  if (pending && pending.id === id && panelPrice() === typed) $('p-amz').innerHTML = html;
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
  const photo = price == null ? pending.photo : null; // 価格を入れたら写真は要らないので捨てる
  if (rec) {
    if (price != null) Object.assign(rec, { store_price: price, tax_rate: taxRate, price_basis: priceBasis, entered_price: Number(digits) });
    if (photo) { await DB.putPhoto(rec.id, photo); photoCache.set(rec.id, photo); rec.photo = true; }
    if (price != null || photo) await DB.update(rec);
  }
  closePanel();
  renderLast();
}
$('p-ok').onclick = () => submitPanel(panelPrice());
$('p-skip').onclick = () => submitPanel(null);
// ---- 値札の写真 ----
// 長辺 1280px・JPEG に縮めて保存する（1枚 100KB 前後）
const PHOTO_MAX = 1280, PHOTO_QUALITY = 0.7;
const photoCache = new Map(); // id -> data URL
function toJpeg(source, w, h) {
  const scale = Math.min(1, PHOTO_MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', PHOTO_QUALITY);
}
function fileToJpeg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(toJpeg(img, img.naturalWidth, img.naturalHeight)); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読めませんでした')); };
    img.src = url;
  });
}
// iPhone のカメラ（または写真の選択）を開いて1枚もらう。やめたときは何も返らない
let fileResolve = null;
function pickPhoto() {
  return new Promise((resolve) => { fileResolve = resolve; $('photo-file').value = ''; $('photo-file').click(); });
}
$('photo-file').addEventListener('change', async () => {
  const file = $('photo-file').files[0], resolve = fileResolve;
  fileResolve = null;
  if (!file || !resolve) return;
  try { resolve(await fileToJpeg(file)); } catch (e) { alert(e.message); }
});

// スキャン中のカメラの映像を JPEG にする。映像がなければ null
function grabFrame() {
  const v = $('video');
  try { return v.videoWidth ? toJpeg(v, v.videoWidth, v.videoHeight) : null; } catch (e) { return null; }
}

function setPendingPhoto(data) {
  if (!pending) return;
  pending.photo = data;
  $('p-thumb').src = data; $('p-thumb').hidden = false;
  $('p-photo-note').textContent = '価格なしで登録すると、この写真を残します';
  $('p-photo').textContent = '📷 撮り直す';
}
// スキャン中はカメラの映像からそのまま撮る（カメラを切り替えずに済む）。止まっていればカメラを開く
$('p-photo').onclick = async () => {
  const v = $('video');
  if (Scanner.isRunning() && v.videoWidth) {
    $('panel').hidden = true;
    $('shoot').hidden = false;
    window.scrollTo(0, 0);
  } else setPendingPhoto(await pickPhoto());
};
function exitShoot() { $('shoot').hidden = true; if (pending) $('panel').hidden = false; }
$('shoot-btn').onclick = async () => {
  const v = $('video');
  if (v.videoWidth) setPendingPhoto(toJpeg(v, v.videoWidth, v.videoHeight));
  else { exitShoot(); setPendingPhoto(await pickPhoto()); return; }
  exitShoot();
};
$('shoot-cancel').onclick = exitShoot;

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
  setPlainPrice(rec, e.target.value === '' ? null : Number(e.target.value));
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
  const rows = listFilter === 'all' ? allRows
    : listFilter === 'noprice' ? allRows.filter(r => r.store_price == null)
      : allRows.filter(r => r.kind === listFilter);
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
      ${r.photo ? `<div class="photo-line"><img class="thumb" data-photo="${r.id}" alt="値札の写真"><span class="hint">写真をタップすると大きく見られます</span></div>`
        : r.store_price == null ? `<div class="photo-line"><button data-photo-add="${r.id}">📷 値札の写真を追加</button></div>` : ''}
      <div class="fields">
        <input type="number" inputmode="numeric" min="0" placeholder="店頭価格(円)" data-f="store_price" value="${r.store_price ?? ''}">
        <input type="text" placeholder="メモ" data-f="note" value="${esc(r.note)}">
      </div>
      ${taxNote(r) ? `<p class="hint tax-note">${taxNote(r)}で入力（税込で保存）</p>` : ''}
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
  // 写真は後から読み込む（一覧を先に出すため）
  for (const img of $('list').querySelectorAll('img[data-photo]')) {
    const id = Number(img.dataset.photo);
    if (!photoCache.has(id)) photoCache.set(id, await DB.getPhoto(id));
    if (photoCache.get(id)) img.src = photoCache.get(id);
  }
}

$('list').addEventListener('change', async (e) => {
  const f = e.target.dataset.f; if (!f) return;
  const id = Number(e.target.closest('li').dataset.id);
  const rec = (await DB.all()).find(r => r.id === id); if (!rec) return;
  if (f === 'store_price') setPlainPrice(rec, e.target.value === '' ? null : Number(e.target.value));
  else rec[f] = e.target.value;
  rec.exported_at = null; // 書き出し後に価格やメモを直したら、次の書き出しに入れ直す
  await DB.update(rec);
  e.target.blur();
  renderList();
  if (f === 'kind' && Price.enabled() && needsFetch(rec)) fetchAmazon(id);
});
$('list').addEventListener('click', async (e) => {
  if (e.target.dataset.photo) return openViewer(Number(e.target.dataset.photo));
  if (e.target.dataset.photoAdd) return attachPhoto(Number(e.target.dataset.photoAdd));
  if (!e.target.dataset.del) return;
  if (!confirm('この記録を削除しますか？')) return;
  await DB.remove(Number(e.target.closest('li').dataset.id));
  renderList();
});

// ---- 写真を大きく見る（見ながら店頭価格を入れる） ----
let viewing = null;
async function attachPhoto(id) {
  const data = await pickPhoto();
  await DB.putPhoto(id, data);
  photoCache.set(id, data);
  const rec = await getRec(id);
  if (rec) { rec.photo = true; await DB.update(rec); }
  renderList();
}
async function openViewer(id) {
  const rec = await getRec(id); if (!rec) return;
  viewing = id;
  $('viewer-img').src = photoCache.get(id) || await DB.getPhoto(id) || '';
  $('viewer-price').value = rec.price_basis === TAX_EXCLUDED ? rec.entered_price ?? '' : rec.store_price ?? '';
  $('viewer-basis').value = rec.price_basis === TAX_EXCLUDED ? (rec.tax_rate === 8 ? 'ex8' : 'ex10') : 'in';
  $('viewer').hidden = false;
}
function closeViewer() { $('viewer').hidden = true; viewing = null; }
$('viewer-close').onclick = closeViewer;
$('viewer-save').onclick = async () => {
  const rec = await getRec(viewing); if (!rec) return closeViewer();
  const v = $('viewer-price').value, basis = $('viewer-basis').value;
  if (v === '') setPlainPrice(rec, null);
  else if (basis === 'in') setPlainPrice(rec, Number(v));
  else {
    const rate = basis === 'ex8' ? 8 : 10;
    Object.assign(rec, { store_price: withTax(Number(v), rate), tax_rate: rate, price_basis: TAX_EXCLUDED, entered_price: Number(v) });
  }
  rec.exported_at = null;
  await DB.update(rec);
  closeViewer();
  renderList();
};
$('viewer-retake').onclick = async () => { const id = viewing; closeViewer(); await attachPhoto(id); };
$('viewer-delete').onclick = async () => {
  if (!confirm('この写真を消しますか？（記録は残ります）')) return;
  const id = viewing;
  await DB.removePhoto(id);
  photoCache.delete(id);
  const rec = await getRec(id);
  if (rec) { rec.photo = false; await DB.update(rec); }
  closeViewer();
  renderList();
};

// ---- 比較（同じ商品の店ごとの価格） ----
// 同じJAN・同じ種別（新品/中古）を1つの商品として、店ごとに一番新しい店頭価格を安い順に並べる
let cmpMode = 'multi';
$('cmp-seg').addEventListener('click', (e) => {
  const c = e.target.dataset.c; if (!c) return;
  cmpMode = c;
  document.querySelectorAll('#cmp-seg button').forEach(b => b.classList.toggle('on', b.dataset.c === c));
  renderCompare();
});
$('cmp-q').addEventListener('input', () => renderCompare());

const storeLabel = (s) => esc(s || '店なし');

async function renderCompare() {
  const all = await DB.all(); // 新しい順
  const titles = new Map(); // jan -> Amazon の商品名
  for (const r of all) if (r.amazon?.found && r.amazon.title && !titles.has(r.jan)) titles.set(r.jan, r.amazon.title);
  const groups = new Map();
  for (const r of all) {
    if (r.store_price == null) continue;
    const key = `${r.jan}|${r.kind || ''}`;
    if (!groups.has(key)) groups.set(key, { jan: r.jan, kind: r.kind || '', stores: new Map() });
    const g = groups.get(key);
    if (!g.stores.has(r.store || '')) g.stores.set(r.store || '', r); // その店の一番新しい記録
  }
  const list = [...groups.values()].map(g => {
    const rows = [...g.stores.values()].sort((a, b) => a.store_price - b.store_price);
    return { ...g, rows, min: rows[0].store_price, title: titles.get(g.jan) || '' };
  });

  // どの店が最安になることが多いか（2店以上で価格がある商品だけで数える。同じ値段なら両方に数える）
  const wins = new Map();
  for (const g of list) {
    if (g.rows.length < 2) continue;
    for (const r of g.rows) if (r.store_price === g.min) wins.set(r.store || '', (wins.get(r.store || '') || 0) + 1);
  }
  $('cmp-summary').innerHTML = wins.size
    ? `<div class="hint">最安になった回数（2店以上で価格がある商品）</div><div class="wins">${[...wins].sort((a, b) => b[1] - a[1])
      .map(([st, n]) => `<span class="win">${storeLabel(st)} <b>${n}件</b></span>`).join('')}</div>` : '';

  const q = $('cmp-q').value.trim().toLowerCase();
  const shown = list.filter(g => (cmpMode === 'all' || g.rows.length >= 2)
    && (!q || g.jan.includes(q) || g.title.toLowerCase().includes(q)));
  $('cmp-empty').textContent = shown.length ? ''
    : list.length && cmpMode === 'multi' && !q ? '2つ以上の店で価格を入れた商品はまだありません。「全て」で1店だけの商品も見られます。'
      : q ? '見つかりませんでした。' : 'まだ店頭価格を入れた記録がありません。';

  const html = [];
  for (const g of shown) {
    const latest = all.find(r => r.jan === g.jan && (r.kind || '') === g.kind && r.amazon?.found);
    let amz = '';
    if (latest && Price.enabled()) {
      const ev = await Price.evaluate({ ...latest, store_price: g.min });
      if (ev) amz = `<div class="cmp-amz">${ev.maxPrice != null && ev.maxPrice > 0 ? `仕入れ上限 <b>${yen(ev.maxPrice)}</b>` : '仕入れ上限：なし'}${ev.calc.profit != null ? ` ・ 最安の店で買うと <span class="${VERDICT_CLASS[ev.verdict]}">${ev.verdict} 利益 ${yen(ev.calc.profit)}</span>` : ''}</div>`;
    }
    html.push(`<li class="cmp-item">
      <div class="item-head"><span class="jan">${esc(g.jan)}${kindTag(g.kind)}</span><span class="time">${g.rows.length}店</span></div>
      ${g.title ? `<div class="cmp-title">${esc(g.title)}</div>` : ''}
      <table class="cmp-table">${g.rows.map(r => `<tr class="${r.store_price === g.min ? 'best' : ''}">
        <td>${storeLabel(r.store)}</td>
        <td class="num">${yen(r.store_price)}</td>
        <td class="diff">${r.store_price === g.min ? (g.rows.length > 1 ? '最安' : '') : `+${yen(r.store_price - g.min)}`}</td>
        <td class="date">${fmtTime(r.scanned_at)}</td></tr>`).join('')}</table>
      ${amz}
    </li>`);
  }
  $('cmp-list').innerHTML = html.join('');
}

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
      q(a?.title), ev?.calc.sellPrice ?? '', ev?.maxPrice ?? '', ev?.calc.profit ?? '', a ? ev.verdict : '', q(a?.asin), a?.salesRank ?? '', q(r.store), r.tax_rate ?? '', r.price_basis ?? '', r.entered_price ?? ''].join(','));
  }
  const body = '﻿' + ['id,jan,scanned_at_jst,store_price,note,kind,amazon_title,amazon_sell_price,max_purchase_price,profit,verdict,asin,sales_rank,store,tax_rate,price_basis,entered_price',
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
