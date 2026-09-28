const $ = (id) => document.getElementById(id);

// ---- 通知（音＋フラッシュ。バイブは対応端末のみ） ----
let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 1200; g.gain.value = 0.15;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.09);
  } catch (e) {}
}
function notify() {
  beep();
  if (navigator.vibrate) navigator.vibrate(60);
  const f = $('flash'); f.classList.add('on');
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

async function onScanned(jan) {
  notify();
  await DB.add(jan);
  scanCount++;
  $('status').textContent = `読み取り中… 今回 ${scanCount}件`;
  const past = (await DB.all()).filter(r => r.jan === jan);
  $('last').innerHTML = `<div class="jan">${jan}</div><div>このコードは${past.length}回目の記録です</div>`;
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
  $('count').textContent = rows.length + '件';
  $('empty').style.display = rows.length ? 'none' : 'block';
  $('list').innerHTML = rows.map(r => {
    // 同じJANの他の記録と店頭価格が違えば警告
    const diff = r.store_price == null ? [] :
      rows.filter(o => o.jan === r.jan && o.id !== r.id && o.store_price != null && o.store_price !== r.store_price);
    const alertHtml = diff.length
      ? `<p class="alert">⚠ 過去の店頭価格と違います：${diff.map(o => `${yen(o.store_price)}（${fmtTime(o.scanned_at)}）`).join('、')}</p>` : '';
    return `<li data-id="${r.id}" class="${diff.length ? 'warn' : ''}">
      <div class="item-head"><span class="jan">${esc(r.jan)}</span><span class="time">${fmtTime(r.scanned_at)}</span></div>
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
async function exportFile(kind) {
  const rows = (await DB.all()).reverse();
  if (!rows.length) return alert('書き出す記録がありません');
  const stamp = new Date().toISOString().slice(0, 10);
  let body, type, name;
  if (kind === 'json') {
    body = JSON.stringify(rows, null, 2); type = 'application/json'; name = `jan-scan_${stamp}.json`;
  } else {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    body = '﻿' + ['id,jan,scanned_at,store_price,note',
      ...rows.map(r => [r.id, q(r.jan), r.scanned_at, r.store_price ?? '', q(r.note)].join(','))].join('\r\n');
    type = 'text/csv'; name = `jan-scan_${stamp}.csv`;
  }
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

// ---- オフライン用 ----
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
