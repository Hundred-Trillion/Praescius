/**
 * Storage module handling IndexedDB initialization and candle transactions.
 */

const DB_NAME = 'AetherisObserverDB';
const DB_VERSION = 1;
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
      if (!db.objectStoreNames.contains(STORE_CANDLES)) {
        const candleStore = db.createObjectStore(STORE_CANDLES, { keyPath: 'id', autoIncrement: true });
        // Create indexes for efficient retrieval
        candleStore.createIndex('symbol', 'symbol', { unique: false });
        candleStore.createIndex('timestamp', 'timestamp', { unique: false });
        candleStore.createIndex('symbol_timeframe', ['symbol', 'timeframe'], { unique: false });
      }

      // Store application/discovery logs
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        const logStore = db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
        logStore.createIndex('timestamp', 'timestamp', { unique: false });
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
    const request = store.add(candle);

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
 * @returns {Promise<object[]>}
 */
export function getCandles(db, symbol = null, timeframe = null, limit = 100) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CANDLES], 'readonly');
    const store = transaction.objectStore(STORE_CANDLES);
    
    let request;
    const candles = [];

    // Order items by newest first or filter by composite index
    if (symbol && timeframe) {
      const index = store.index('symbol_timeframe');
      const keyRange = IDBKeyRange.only([symbol, timeframe]);
      request = index.openCursor(keyRange, 'prev'); // latest first
    } else if (symbol) {
      const index = store.index('symbol');
      const keyRange = IDBKeyRange.only(symbol);
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
 * @returns {Promise<number>}
 */
export function saveLog(db, message, type = 'info') {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_LOGS], 'readwrite');
    const store = transaction.objectStore(STORE_LOGS);
    const request = store.add({
      timestamp: Date.now(),
      message,
      type
    });

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieve system logs.
 * @param {IDBDatabase} db 
 * @param {number} limit 
 * @returns {Promise<object[]>}
 */
export function getLogs(db, limit = 50) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_LOGS], 'readonly');
    const store = transaction.objectStore(STORE_LOGS);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    const logs = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && logs.length < limit) {
        logs.push(cursor.value);
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
