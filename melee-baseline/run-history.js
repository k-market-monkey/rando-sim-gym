// Keep the small selector index separate from potentially large replay recordings.
const db = new Promise((resolve, reject) => {
  const request = indexedDB.open('melee-gym-runs', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('index', { keyPath: 'id' });
    request.result.createObjectStore('reports');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function read(store, key) {
  const tx = (await db).transaction(store);
  return new Promise((resolve, reject) => {
    const table = tx.objectStore(store);
    const request = key === undefined ? table.getAll() : table.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export const listRuns = () => read('index');
export const loadRun = (id) => read('reports', id);
async function update(write) {
  const tx = (await db).transaction(['index', 'reports'], 'readwrite');
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
    write(tx.objectStore('index'), tx.objectStore('reports'));
  });
}

export const saveRun = (entry, report) =>
  update((index, reports) => {
    index.put(entry);
    reports.put(report, entry.id);
  });
export const deleteRun = (id) =>
  update((index, reports) => {
    index.delete(id);
    reports.delete(id);
  });
