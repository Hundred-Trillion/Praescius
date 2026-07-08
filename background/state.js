/**
 * Shared State module for Background Service Worker.
 */
export const sessions = {};
export const candleCache = {};
export const ruleCooldowns = {};
export const latestWsPrices = {};
export const adaptiveConfidences = {};
export const activeBuildingCandles = {};

export const globalState = {
  db: null,
  appLogger: null
};
