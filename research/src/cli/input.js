// 入力ファイルを、調べる処理の形（records）にそろえる。
// 対応している形式：
//   - Expo版アプリの JSON：{ app: 'jan-scanner', format_version: 1, records: [...] }
//   - PWA版（このリポジトリ）の JSON：[{ id, jan, scanned_at, store_price, note, kind, store }, ...]
//   - このスクリプトが作った結果の CSV（Excel で「Amazon価格(手入力)」などを書き込んで保存したもの）

import { MANUAL_PRICE, MANUAL_FBA } from './output.js';

/** ファイルの中身を文字にする。Excel が「CSV（コンマ区切り）」で保存すると Shift_JIS になるため、それも読む */
export function decodeText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('shift_jis').decode(bytes); }
}

export function parseScanExport(text, fileName = '') {
  text = text.replace(/^﻿/, '');
  if (/^\s*[[{]/.test(text)) return parseJson(text, fileName);
  if (/^[^\r\n]*JAN/.test(text)) return parseResultCsv(text, fileName);
  throw new Error(`${fileName} は読めない形式です（アプリの JSON か、このスクリプトが作った CSV を指定してください）`);
}

function parseJson(text, fileName) {
  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error(`${fileName} は JSON として読めません`); }

  if (Array.isArray(data)) {
    return data.map((r) => record({
      jan: r.jan,
      purchasePrice: r.store_price,
      kind: r.kind,
      storeName: r.store,
      scannedAt: r.scanned_at,
      note: r.note,
    }));
  }
  if (data && Array.isArray(data.records)) {
    return data.records.map((r) => record({
      jan: r.jan,
      purchasePrice: r.store_price,
      kind: r.kind,
      storeName: r.store,
      productName: r.product_name,
      scannedAt: r.scanned_at_local || r.scanned_at,
      note: r.note,
    }));
  }
  throw new Error(`${fileName} はスキャナーアプリの書き出し形式ではありません`);
}

function parseResultCsv(text, fileName) {
  const [header, ...rows] = parseCsv(text);
  const col = (name) => header.indexOf(name);
  if (col('JAN') < 0) throw new Error(`${fileName} に「JAN」の列がありません`);
  const get = (row, name) => (col(name) >= 0 ? row[col(name)] ?? '' : '');
  return rows.map((row) => record({
    jan: get(row, 'JAN'),
    purchasePrice: get(row, '仕入れ値'),
    kind: { 新品: 'new', 中古: 'used' }[get(row, '種別')],
    storeName: get(row, '店'),
    productName: get(row, 'アプリの商品名'),
    scannedAt: get(row, '日時'),
    note: get(row, 'メモ'),
    manualSellPrice: get(row, MANUAL_PRICE),
    manualFbaFee: get(row, MANUAL_FBA),
  }));
}

function record(r) {
  return {
    jan: String(r.jan ?? '').replace(/^="?|"$/g, ''),
    purchasePrice: toPrice(r.purchasePrice),
    kind: r.kind || '',
    storeName: r.storeName ?? '',
    productName: r.productName ?? '',
    scannedAt: r.scannedAt ?? '',
    note: r.note ?? '',
    manualSellPrice: toPrice(r.manualSellPrice),
    manualFbaFee: toPrice(r.manualFbaFee),
  };
}

/** 「1,980」「¥1980」「1980円」なども数字として読む */
function toPrice(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[,¥￥円\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** CSV を行と列に分ける（"" で囲まれた中のコンマ・改行に対応） */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}
