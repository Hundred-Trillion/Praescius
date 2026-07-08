/**
 * Storage module handling IndexedDB initialization and candle transactions.
 */

const DB_NAME = 'PraesciusDB';
const DB_VERSION = 2;
const STORE_CANDLES = 'candles';
const STORE_LOGS = 'logs';

/**
 * Initializes IndexedDB instances.
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      reject(new Error(`Failed to open DB: ${event.target.error}`));
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store raw candles
      let candleStore;
      if (!db.objectStoreNames.contains(STORE_CANDLES)) {
        candleStore = db.createObjectStore(STORE_CANDLES, { keyPath: 'id', autoIncrement: true });
      } else {
        candleStore = event.target.transaction.objectStore(STORE_CANDLES);
      }

      if (!candleStore.indexNames.contains('symbol')) {
        candleStore.createIndex('symbol', 'symbol', { unique: false });
      }
      if (!candleStore.indexNames.contains('timestamp')) {
        candleStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!candleStore.indexNames.contains('symbol_timeframe')) {
        candleStore.createIndex('symbol_timeframe', ['symbol', 'timeframe'], { unique: false });
      }
      if (!candleStore.indexNames.contains('tabId')) {
        candleStore.createIndex('tabId', 'tabId', { unique: false });
      }
      if (!candleStore.indexNames.contains('provider')) {
        candleStore.createIndex('provider', 'provider', { unique: false });
      }
      if (!candleStore.indexNames.contains('tabId_symbol_timeframe')) {
        candleStore.createIndex('tabId_symbol_timeframe', ['tabId', 'symbol', 'timeframe'], { unique: false });
      }

      // Store application/discovery logs
      let logStore;
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        logStore = db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
      } else {
        logStore = event.target.transaction.objectStore(STORE_LOGS);
      }

      if (!logStore.indexNames.contains('timestamp')) {
        logStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!logStore.indexNames.contains('tabId')) {
        logStore.createIndex('tabId', 'tabId', { unique: false });
      }
      if (!logStore.indexNames.contains('provider')) {
        logStore.createIndex('provider', 'provider', { unique: false });
      }
      if (!logStore.indexNames.contains('tabId_timestamp')) {
        logStore.createIndex('tabId_timestamp', ['tabId', 'timestamp'], { unique: false });
      }
    };
  });
}

/**
 * Save a parsed candle block.
 * @param {IDBDatabase} db 
 * @param {object} candle 
 * @returns {Promise<number>} Key of the inserted record
 */
export function saveCandle(db, candle) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CANDLES], 'readwrite');
    const store = transaction.objectStore(STORE_CANDLES);
    const record = {
      ...candle,
      tabId: candle.tabId || 'default',
      provider: candle.provider || 'unknown'
    };
    const request = store.add(record);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves candles matching filter parameters.
 * @param {IDBDatabase} db 
 * @param {string} symbol 
 * @param {string} timeframe 
 * @param {number} limit 
 * @param {string|number} tabId 
 * @returns {Promise<object[]>}
 */
export function getCandles(db, symbol = null, timeframe = null, limit = 100, tabId = null) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CANDLES], 'readonly');
    const store = transaction.objectStore(STORE_CANDLES);
    
    let request;
    const candles = [];

    // Order items by newest first or filter by composite index
    if (tabId && symbol && timeframe) {
      const index = store.index('tabId_symbol_timeframe');
      const keyRange = IDBKeyRange.only([tabId, symbol, timeframe]);
      request = index.openCursor(keyRange, 'prev');
    } else if (symbol && timeframe) {
      const index = store.index('symbol_timeframe');
      const keyRange = IDBKeyRange.only([symbol, timeframe]);
      request = index.openCursor(keyRange, 'prev'); // latest first
    } else if (symbol) {
      const index = store.index('symbol');
      const keyRange = IDBKeyRange.only(symbol);
      request = index.openCursor(keyRange, 'prev');
    } else if (tabId) {
      const index = store.index('tabId');
      const keyRange = IDBKeyRange.only(tabId);
      request = index.openCursor(keyRange, 'prev');
    } else {
      const index = store.index('timestamp');
      request = index.openCursor(null, 'prev');
    }

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && candles.length < limit) {
        candles.push(cursor.value);
        cursor.continue();
      } else {
        // Return sorted chronologically (oldest to newest) for indicators
        resolve(candles.reverse());
      }
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get total logged candle count.
 * @param {IDBDatabase} db
 * @returns {Promise<number>}
 */
export function getCandleCount(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CANDLES], 'readonly');
    const store = transaction.objectStore(STORE_CANDLES);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Saves a system log.
 * @param {IDBDatabase} db 
 * @param {string} message 
 * @param {string} type 
 * @param {string} provider 
 * @param {string|number} tabId 
 * @returns {Promise<number>}
 */
export function saveLog(db, message, type = 'info', provider = 'system', tabId = 'default') {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_LOGS], 'readwrite');
    const store = transaction.objectStore(STORE_LOGS);
    const request = store.add({
      timestamp: Date.now(),
      message,
      type,
      provider: provider || 'system',
      tabId: tabId || 'default'
    });

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieve system logs.
 * @param {IDBDatabase} db 
 * @param {number} limit 
 * @param {string|number} tabId 
 * @param {string} provider 
 * @returns {Promise<object[]>}
 */
export function getLogs(db, limit = 50, tabId = null, provider = null) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_LOGS], 'readonly');
    const store = transaction.objectStore(STORE_LOGS);
    
    let request;
    const logs = [];

    if (tabId) {
      const index = store.index('tabId_timestamp');
      const keyRange = IDBKeyRange.bound([tabId, 0], [tabId, Date.now()]);
      request = index.openCursor(keyRange, 'prev');
    } else {
      const index = store.index('timestamp');
      request = index.openCursor(null, 'prev');
    }

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && logs.length < limit) {
        if (!provider || cursor.value.provider === provider) {
          logs.push(cursor.value);
        }
        cursor.continue();
      } else {
        resolve(logs);
      }
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Clears stores.
 * @param {IDBDatabase} db 
 * @returns {Promise<void>}
 */
export function clearDatabase(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CANDLES, STORE_LOGS], 'readwrite');
    const candleStore = transaction.objectStore(STORE_CANDLES);
    const logStore = transaction.objectStore(STORE_LOGS);
    
    candleStore.clear();
    logStore.clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Prunes older entries from database stores to restrict disk allocation.
 * @param {IDBDatabase} db 
 * @param {number} maxTicks 
 * @param {number} maxCandles 
 * @param {number} maxLogs 
 * @returns {Promise<void>}
 */
export function pruneDatabase(db, maxTicks = 20000, maxCandles = 5000, maxLogs = 2000) {
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_CANDLES, STORE_LOGS], 'readwrite');
    
    // Prune Candles
    const candleStore = transaction.objectStore(STORE_CANDLES);
    const candleIndex = candleStore.index('timestamp');
    let ticksEncountered = 0;
    let candlesEncountered = 0;
    
    candleIndex.openCursor(null, 'prev').onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const record = cursor.value;
        const tf = record.timeframe;
        
        if (tf === 'tick') {
          ticksEncountered++;
          if (ticksEncountered > maxTicks) {
            cursor.delete();
          }
        } else {
          candlesEncountered++;
          if (candlesEncountered > maxCandles) {
            cursor.delete();
          }
        }
        cursor.continue();
      }
    };

    // Prune Logs
    const logStore = transaction.objectStore(STORE_LOGS);
    const logIndex = logStore.index('timestamp');
    let logCount = 0;

    logIndex.openCursor(null, 'prev').onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        logCount++;
        if (logCount > maxLogs) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}
