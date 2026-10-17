// スキャナーアプリが書き出した JSON を、調べる処理の形（records）にそろえる。
// 対応している形式：
//   - Expo版アプリ：{ app: 'jan-scanner', format_version: 1, records: [...] }
//   - PWA版（このリポジトリ）：[{ id, jan, scanned_at, store_price, note, kind }, ...]

export function parseScanExport(text, fileName = '') {
  let data;
  try { data = JSON.parse(text.replace(/^﻿/, '')); }
  catch (e) { throw new Error(`${fileName} は JSON として読めません（CSVではなくJSONで書き出してください）`); }

  if (Array.isArray(data)) {
    return data.map((r) => ({
      jan: String(r.jan ?? ''),
      purchasePrice: toPrice(r.store_price),
      kind: r.kind || '',
      storeName: '',
      productName: '',
      scannedAt: r.scanned_at ?? '',
      note: r.note ?? '',
    }));
  }
  if (data && Array.isArray(data.records)) {
    return data.records.map((r) => ({
      jan: String(r.jan ?? ''),
      purchasePrice: toPrice(r.store_price),
      kind: r.kind || '',
      storeName: r.store ?? '',
      productName: r.product_name ?? '',
      scannedAt: r.scanned_at_local || r.scanned_at || '',
      note: r.note ?? '',
    }));
  }
  throw new Error(`${fileName} はスキャナーアプリの書き出し形式ではありません`);
}

function toPrice(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
