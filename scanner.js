// カメラによる連続スキャン（ZXing-WASM）。シャッター不要。
const Scanner = (() => {
  const DEBOUNCE_MS = 3000;   // 同じコードを再登録しない時間
  const CONFIRM_MS = 1500;    // 同じ結果を連続2回読めたときだけ採用（誤読対策）
  const MAX_WIDTH = 1600;     // 解析に使う横幅（大きいほど遠くのコードを読めるが重くなる）
  const FORMATS = ['EAN-13', 'EAN-8', 'UPC-A'];

  ZXingWASM.setZXingModuleOverrides({
    locateFile: (path, prefix) => (path.endsWith('.wasm') ? 'vendor/zxing_reader.wasm' : prefix + path),
  });

  let running = false, stream = null, video = null, onCode = null;
  let pending = null; // { code, at }
  const lastSeen = new Map(); // jan -> 最後に受け付けた時刻
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // チェックデジット検証。8桁は日本の短縮JAN(45/49始まり)だけ許可する
  function validGtin(code) {
    if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) return false;
    if (code.length === 8 && !/^(45|49)/.test(code)) return false;
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
    if (!pending || pending.code !== text || now - pending.at > CONFIRM_MS) {
      pending = { code: text, at: now }; // 1回目：確認待ち
      return;
    }
    pending = null;
    lastSeen.set(text, now);
    onCode && onCode(text);
  }

  async function loop() {
    while (running) {
      const t0 = performance.now();
      if (video.readyState >= 2 && video.videoWidth) {
        // 画面中央の横帯だけを解析する（速い）
        const vw = video.videoWidth, vh = video.videoHeight;
        const sh = Math.round(vh * 0.55), sy = Math.round((vh - sh) / 2);
        const scale = Math.min(1, MAX_WIDTH / vw);
        canvas.width = Math.round(vw * scale);
        canvas.height = Math.round(sh * scale);
        ctx.drawImage(video, 0, sy, vw, sh, 0, 0, canvas.width, canvas.height);
        try {
          const res = await ZXingWASM.readBarcodes(
            ctx.getImageData(0, 0, canvas.width, canvas.height),
            { formats: FORMATS, tryHarder: true, tryRotate: true, maxNumberOfSymbols: 1 });
          if (res.length && res[0].isValid !== false) accept(res[0].text);
        } catch (e) { /* 1フレームの失敗は無視 */ }
      }
      const wait = Math.max(0, 60 - (performance.now() - t0));
      await new Promise(r => setTimeout(r, wait));
    }
  }

  async function start(videoEl, callback) {
    if (running) return;
    video = videoEl; onCode = callback; pending = null;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    running = true;
    loop();
  }

  function stop() {
    running = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  return { start, stop, validGtin, isRunning: () => running, _decode: (img) => ZXingWASM.readBarcodes(img, { formats: FORMATS, tryHarder: true, tryRotate: true, maxNumberOfSymbols: 1 }) };
})();
