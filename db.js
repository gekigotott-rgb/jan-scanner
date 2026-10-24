// IndexedDB による保存。項目: id, jan, kind, store(店名), scanned_at, store_price(任意), note(任意), exported_at, photo(値札の写真があれば true)
// 写真は一覧を軽く保つため、別の入れ物(photos)に記録の id ごとに入れる（JPEG の data URL）。
const DB = (() => {
  const NAME = 'jan-scanner', STORE = 'scans', PHOTOS = 'photos';
  let dbp;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          s.createIndex('jan', 'jan');
        }
        if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function run(mode, fn, store = STORE) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const out = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    add: (rec) => run('readwrite', s => s.add({ kind: '', store: '', scanned_at: new Date().toISOString(), store_price: null, note: '', ...rec })),
    update: (rec) => run('readwrite', s => s.put(rec)),
    remove: async (id) => { await run('readwrite', s => s.delete(id)); await run('readwrite', s => s.delete(id), PHOTOS); },
    all: async () => (await run('readonly', s => s.getAll())).sort((a, b) => b.id - a.id),
    putPhoto: (id, data) => run('readwrite', s => s.put({ id, data }), PHOTOS),
    getPhoto: async (id) => (await run('readonly', s => s.get(id), PHOTOS))?.data ?? null,
    removePhoto: (id) => run('readwrite', s => s.delete(id), PHOTOS),
  };
})();
