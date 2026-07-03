/**
 * Storage systems profiling inspector.
 */

export async function profileStorage() {
  const report = {
    localStorageCount: 0,
    sessionStorageCount: 0,
    indexedDBNames: []
  };

  try {
    report.localStorageCount = Object.keys(localStorage).length;
    report.sessionStorageCount = Object.keys(sessionStorage).length;

    // Check databases (supported in Chrome/Modern browsers)
    if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
      const dbs = await window.indexedDB.databases();
      report.indexedDBNames = dbs.map(db => db.name);
    }
  } catch (err) {
    report.error = err.message;
  }

  return report;
}
