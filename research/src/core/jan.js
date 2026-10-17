// JANコードの検証と正規化。
// core/ 以下は Node 専用の機能を使わない（フェーズBで Cloudflare Workers にそのまま持っていくため）。

/** チェックデジットが正しい EAN-8 / EAN-13 か */
export function isValidEan(code) {
  if (!/^(\d{8}|\d{13})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  // 右から数えて奇数番目に3を掛ける
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** 数字以外を取り除き、12桁(UPC-A)は先頭に0を付けて13桁にする。正しくなければ null */
export function normalizeJan(raw) {
  let code = String(raw ?? '').replace(/\D/g, '');
  if (code.length === 12) code = '0' + code;
  return isValidEan(code) ? code : null;
}
