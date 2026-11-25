// لایه‌ی ذخیره‌سازی آفلاین با IndexedDB
const STORES = ['customers', 'products', 'invoices', 'settings'];
let dbp;
const open = () => dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open('factor-db', 1);
  r.onupgradeneeded = () => { for (const s of STORES) r.result.createObjectStore(s, s === 'settings' ? { keyPath: 'key' } : { keyPath: 'id', autoIncrement: true }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
export const all = s => tx(s, 'readonly', o => o.getAll());
export const get = (s, id) => tx(s, 'readonly', o => o.get(id));
export const put = (s, v) => tx(s, 'readwrite', o => o.put(v));
export const del = (s, id) => tx(s, 'readwrite', o => o.delete(id));
export const getSetting = async (k, d) => (await get('settings', k))?.value ?? d;
export const setSetting = (k, value) => put('settings', { key: k, value });
export async function exportAll() { const o = {}; for (const s of STORES) o[s] = await all(s); return o; }
export async function importAll(o) {
  if (!o || typeof o !== 'object' || !STORES.some(s => Array.isArray(o[s])) || STORES.some(s => o[s] !== undefined && !Array.isArray(o[s]))) throw new Error('bad backup');
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORES, 'readwrite'); for (const s of STORES) { const st = t.objectStore(s); st.clear(); (o[s] || []).forEach(v => st.put(v)); } t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
}
