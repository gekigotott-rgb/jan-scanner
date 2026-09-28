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
  ['scan', 'list'].forEach(n => {
    $('view-' + n).classList.toggle('active', n === name);
    $('tab-' + n).classList.toggle('active', n === name);
  });
  if (name === 'list') { stopScan(); renderList(); }
}
$('tab-scan').onclick = () => show('scan');
$('tab-list').onclick = () => show('list');

// ---- スキャン ----
const fmtTime = (iso) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const yen = (n) => '¥' + Number(n).toLocaleString('ja-JP');
let scanCount = 0;

function ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '1分以内';
  if (m < 60) return `${m}分前`;
  return `${Math.floor(m / 60)}時間${m % 60}分前`;
}

async function onScanned(jan) {
  const before = (await DB.all()).filter(r => r.jan === jan); // 新しい順（今回の分を含まない）
  const repeat = before.length > 0;
  notify(repeat);
  await DB.add(jan);
  scanCount++;
  $('status').textContent = `読み取り中… 今回 ${scanCount}件`;
  $('last').className = 'last ' + (repeat ? 'repeat' : 'fresh');
  $('last').innerHTML = `<div class="jan">${jan}</div>` + (repeat
    ? `<div class="tag">⚠ ${before.length + 1}回目（前回 ${fmtTime(before[0].scanned_at)}・${ago(before[0].scanned_at)}）</div>`
    : `<div class="tag">新規</div>`);
}

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

async function renderList() {
  const rows = await DB.all();
  const kinds = new Set(rows.map(r => r.jan)).size;
  const times = {};
  rows.forEach(r => { times[r.jan] = (times[r.jan] || 0) + 1; });
  $('count').textContent = `${rows.length}件（${kinds}種類）`;
  $('empty').style.display = rows.length ? 'none' : 'block';
  $('list').innerHTML = rows.map(r => {
    // 同じJANの他の記録と店頭価格が違えば警告
    const diff = r.store_price == null ? [] :
      rows.filter(o => o.jan === r.jan && o.id !== r.id && o.store_price != null && o.store_price !== r.store_price);
    const alertHtml = diff.length
      ? `<p class="alert">⚠ 過去の店頭価格と違います：${diff.map(o => `${yen(o.store_price)}（${fmtTime(o.scanned_at)}）`).join('、')}</p>` : '';
    return `<li data-id="${r.id}" class="${diff.length ? 'warn' : ''}">
      <div class="item-head"><span class="jan">${esc(r.jan)}${times[r.jan] > 1 ? `<span class="badge">×${times[r.jan]}</span>` : ''}</span><span class="time">${fmtTime(r.scanned_at)}</span></div>
      ${alertHtml}
      <div class="fields">
        <input type="number" inputmode="numeric" min="0" placeholder="店頭価格(円)" data-f="store_price" value="${r.store_price ?? ''}">
        <input type="text" placeholder="メモ" data-f="note" value="${esc(r.note)}">
      </div>
      <div class="item-foot"><button class="danger" data-del="1">削除</button></div>
    </li>`;
  }).join('');
}

$('list').addEventListener('change', async (e) => {
  const f = e.target.dataset.f; if (!f) return;
  const id = Number(e.target.closest('li').dataset.id);
  const rec = (await DB.all()).find(r => r.id === id); if (!rec) return;
  rec[f] = f === 'store_price' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
  await DB.update(rec);
  if (f === 'store_price') renderList();
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

function buildExport(kind, rows, now = new Date()) {
  const stamp = toJst(now.toISOString()).slice(0, 10);
  if (kind === 'json') {
    const data = rows.map(r => ({ ...r, scanned_at: toJst(r.scanned_at).slice(0, 19) + '+09:00' }));
    return { body: JSON.stringify(data, null, 2), type: 'application/json', name: `jan-scan_${stamp}.json` };
  }
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = '﻿' + ['id,jan,scanned_at_jst,store_price,note',
    ...rows.map(r => [r.id, q(r.jan), toJst(r.scanned_at).slice(0, 19).replace('T', ' '), r.store_price ?? '', q(r.note)].join(','))].join('\r\n');
  return { body, type: 'text/csv', name: `jan-scan_${stamp}.csv` };
}

async function exportFile(kind) {
  const rows = (await DB.all()).reverse();
  if (!rows.length) return alert('書き出す記録がありません');
  const { body, type, name } = buildExport(kind, rows);
  const file = new File([body], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
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

// ---- オフライン用 ----
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // 新しいバージョンに切り替わったら、一度だけ読み込み直す（更新を反映するため）
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
