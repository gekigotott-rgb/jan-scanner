// カメラによる連続スキャン（ZXing）。シャッター不要。
const Scanner = (() => {
  const DEBOUNCE_MS = 3000;
  let reader = null, running = false, onCode = null;
  const lastSeen = new Map(); // jan -> 最後に受け付けた時刻

  // EAN-13 / EAN-8 / UPC-A(12桁) / UPC-E(8桁) のチェックデジット検証
  function validGtin(code) {
    if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) return false;
    const d = code.split('').map(Number);
    const check = d.pop();
    let sum = 0;
    d.reverse().forEach((n, i) => { sum += n * (i % 2 === 0 ? 3 : 1); });
    return (10 - (sum % 10)) % 10 === check;
  }

  function accept(text) {
    if (!validGtin(text)) return;
    const now = Date.now();
    if (now - (lastSeen.get(text) || 0) < DEBOUNCE_MS) return;
    lastSeen.set(text, now);
    onCode && onCode(text);
  }

  async function start(video, callback) {
    if (running) return;
    onCode = callback;
    const Z = ZXing;
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,
      [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    reader = new Z.BrowserMultiFormatReader(hints, 150);
    running = true;
    await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      video,
      (result) => { if (result) accept(result.getText()); }
    );
  }

  function stop() {
    if (reader) reader.reset();
    reader = null; running = false;
  }

  return { start, stop, validGtin, isRunning: () => running };
})();
