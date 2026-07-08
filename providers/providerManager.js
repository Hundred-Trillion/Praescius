/**
 * Provider Manager.
 * Orchestrates multi-provider dynamic routing across plug-in platforms.
 */

import { QuotexProvider } from './quotex/index.js';
import { BinanceProvider } from './binance/index.js';
import { TradingViewProvider } from './tradingview/index.js';
import { PocketOptionProvider } from './pocketoption/index.js';
import { BybitProvider } from './bybit/index.js';

// Static plugin imports to comply with Service Worker CSP/import restrictions
const STATIC_PLUGINS = {};

class ProviderManager {
  constructor() {
    // List of active providers
    this.providers = [
      new QuotexProvider(),
      new BinanceProvider(),
      new TradingViewProvider(),
      new PocketOptionProvider(),
      new BybitProvider()
    ];
    this.activeProvider = null;
  }

  /**
   * Scans registers to find matching parser profile.
   * @param {string} url 
   * @param {string} title 
   * @returns {BaseProvider | null}
   */
  detectProvider(url, title) {
    if (!url) return null;
    const match = this.providers.find(p => p.matches(url, title));
    if (match) {
      this.activeProvider = match;
      return match;
    }
    return null;
  }

  /**
   * Scans registers to find matching provider by URL/Title without modifying global state.
   */
  getProviderForUrl(url, title) {
    if (!url) return null;
    return this.providers.find(p => p.matches(url, title || '')) || null;
  }

  /**
   * Routes the payload parsing execution to the active or default parser.
   * @param {string} payload 
   * @param {'incoming' | 'outgoing'} direction 
   * @returns {object | null} parsed candle
   */
  parseFrame(payload, direction) {
    const parser = this.activeProvider || this.providers[0];
    return parser.parse(payload, direction);
  }

  /**
   * Parses frame with scoped tab URL/Title context.
   */
  parseFrameForUrl(url, title, payload, direction) {
    const parser = this.getProviderForUrl(url, title) || this.providers[0];
    return parser.parse(payload, direction);
  }

  /**
   * Dynamically loads provider plugins from /plugins/ directory.
   */
  async loadPlugins() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['pluginRegistry'], async (res) => {
        const list = res.pluginRegistry || [];
        for (const key of list) {
          try {
            const manifestUrl = chrome.runtime.getURL(`plugins/${key}/manifest.json`);
            const manifestRes = await fetch(manifestUrl);
            if (!manifestRes.ok) continue;
            const manifest = await manifestRes.json();

            const selectorsUrl = chrome.runtime.getURL(`plugins/${key}/selectors.json`);
            const selectorsRes = await fetch(selectorsUrl);
            const selectors = selectorsRes.ok ? await selectorsRes.json() : [];

            // Use statically imported provider class to comply with Service Worker rules
            const ProviderClass = STATIC_PLUGINS[key];
            if (!ProviderClass) {
              console.warn(`[Plugin SDK] Statically registered provider for plugin '${key}' not found.`);
              continue;
            }

            const providerInst = new ProviderClass();
            providerInst.selectors = selectors;
            providerInst.name = manifest.name || key;

            const existingIdx = this.providers.findIndex(p => p.name === providerInst.name);
            if (existingIdx !== -1) {
              this.providers[existingIdx] = providerInst;
            } else {
              this.providers.push(providerInst);
            }
            console.log(`[Plugin SDK] Successfully loaded external provider plugin: ${key}`);
          } catch (err) {
            console.error(`[Plugin SDK] Error loading plugin: ${key}`, err);
          }
        }
        resolve();
      });
    });
  }
}

export const providerManager = new ProviderManager();
export default providerManager;
