/**
 * Provider Manager.
 * Orchestrates multi-provider dynamic routing across plug-in platforms.
 */

import { QuotexProvider } from './quotex/index.js';
import { BinanceProvider } from './binance/index.js';
import { TradingViewProvider } from './tradingview/index.js';
import { DerivProvider } from './deriv/index.js';
import { PocketOptionProvider } from './pocketoption/index.js';
import { BybitProvider } from './bybit/index.js';
import { OKXProvider } from './okx/index.js';
import { MT5Provider } from './mt5/index.js';

class ProviderManager {
  constructor() {
    // List of active providers
    this.providers = [
      new QuotexProvider(),
      new BinanceProvider(),
      new TradingViewProvider(),
      new DerivProvider(),
      new PocketOptionProvider(),
      new BybitProvider(),
      new OKXProvider(),
      new MT5Provider()
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
   * Routes the payload parsing execution to the active or default parser.
   * @param {string} payload 
   * @param {'incoming' | 'outgoing'} direction 
   * @returns {object | null} parsed candle
   */
  parseFrame(payload, direction) {
    const parser = this.activeProvider || this.providers[0];
    return parser.parse(payload, direction);
  }
}

export const providerManager = new ProviderManager();
export default providerManager;
