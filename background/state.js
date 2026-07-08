/**
 * Shared State module for Background Service Worker.
 */
export const sessions = {};
export const ruleCooldowns = {};
export const latestWsPrices = {};
export const adaptiveConfidences = {};
export const activePositions = {};

export const globalState = {
  db: null,
  appLogger: null,
  killSwitch: false
};
