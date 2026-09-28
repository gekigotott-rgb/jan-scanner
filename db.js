// IndexedDB による保存。項目: id, jan, scanned_at, store_price(任意), note(任意)
const DB = (() => {
  const NAME = 'jan-scanner', STORE = 'scans';
  let dbp;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('jan', 'jan');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    add: (jan, kind = '') => run('readwrite', s => s.add({ jan, kind, scanned_at: new Date().toISOString(), store_price: null, note: '' })),
    update: (rec) => run('readwrite', s => s.put(rec)),
    remove: (id) => run('readwrite', s => s.delete(id)),
    all: async () => (await run('readonly', s => s.getAll())).sort((a, b) => b.id - a.id),
  };
})();
