// 結果を Excel で開ける CSV にする（BOM付き・JANは文字列のまま表示される形）。

const COLUMNS = [
  ['判定', (r) => r.verdict],
  ['JAN', (r) => `="${r.info.jan}"`],
  ['Amazonの商品名', (r) => r.info.title],
  ['アプリの商品名', (r) => r.record.productName],
  ['店', (r) => r.record.storeName],
  ['日時', (r) => r.record.scannedAt],
  ['種別', (r) => ({ new: '新品', used: '中古' })[r.record.kind] || ''],
  ['仕入れ値', (r) => r.record.purchasePrice],
  ['販売価格', (r) => r.calc.sellPrice],
  ['販売価格の種類', (r) => r.calc.sellPriceType],
  ['販売手数料', (r) => r.calc.referralFee],
  ['FBA手数料', (r) => r.calc.fbaFee],
  ['利益', (r) => r.calc.profit],
  ['利益率(対販売価格)', (r) => pct(r.calc.margin)],
  ['ROI(対仕入れ値)', (r) => pct(r.calc.roi)],
  ['ランキング', (r) => r.info.salesRank],
  ['30日の販売数の目安', (r) => r.info.rankDrops30],
  ['Amazon本体', (r) => (r.info.found ? (r.info.amazonPrice != null ? `あり(${r.info.amazonPrice}円)` : 'なし') : '')],
  ['新品最安', (r) => r.info.newPrice],
  ['中古最安', (r) => r.info.usedPrice],
  ['ASIN', (r) => r.info.asin],
  ['Amazonのページ', (r) => (r.info.asin ? `https://www.amazon.co.jp/dp/${r.info.asin}` : '')],
  ['メモ', (r) => r.record.note],
  ['取得元', (r) => r.info.source],
  ['エラー', (r) => r.info.error],
];

const pct = (v) => (v == null ? null : `${Math.round(v * 1000) / 10}%`);

function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.startsWith('="')) return s; // Excel用の文字列指定はそのまま
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const ORDER = { '◎': 0, '△': 1, '?': 2, '×': 3 };

/** 判定の良い順・利益の大きい順に並べて CSV にする */
export function buildResultCsv(rows) {
  const sorted = [...rows].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || (b.calc.profit ?? -Infinity) - (a.calc.profit ?? -Infinity));
  const lines = [COLUMNS.map(([h]) => h).join(',')];
  for (const r of sorted) lines.push(COLUMNS.map(([, f]) => cell(f(r))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
