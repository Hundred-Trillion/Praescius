import BaseProvider from '../baseProvider.js';
import { normalizeSymbol } from '../../utils/helpers.js';

export class TradingViewProvider extends BaseProvider {
  constructor() {
    super('tradingview');
    this.currentSymbol = 'BTC/USD';
    this.selectors = ['.chart-markup-table div.price', 'span[class*="last-value-"]', 'div[class*="selected-value-"]'];
    this.seriesMap = {};
    this.symbolMap = {};
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('tradingview.com') || cleanTitle.includes('tradingview');
  }


  isMetadataSymbol(symbol) {
    if (!symbol) return true;
    const s = String(symbol).toUpperCase().replace(/[^A-Z]/g, '');
    return s.includes('SPLITS') || 
           s.includes('CURRENCYID') || 
           s.includes('VOLUME') || 
           s.includes('DIVIDENDS') || 
           s.includes('EARNINGS') || 
           s.includes('NONE') || 
           s.includes('SPINOFFS') || 
           s.includes('RIGHTS');
  }

  parse(payload, direction) {
    if (!payload || typeof payload !== 'string') return null;

    // Handle outgoing packets to capture series and symbol registrations
    if (direction === 'outgoing') {
      try {
        if (payload.includes('~m~')) {
          const parts = payload.split(/~m~\d+~m~/);
          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.m === 'create_series' && Array.isArray(parsed.p) && parsed.p.length >= 4) {
                const seriesId = parsed.p[1];
                const rawSymbol = parsed.p[3] || parsed.p[2];
                if (typeof rawSymbol === 'string' && rawSymbol.length > 2) {
                  const symbol = this.formatSymbol(rawSymbol);
                  if (!this.isMetadataSymbol(symbol)) {
                    this.seriesMap[seriesId] = symbol;
                    this.currentSymbol = symbol;
                    console.log(`[TradingView] Mapped series ${seriesId} to symbol ${symbol}`);
                  }
                }
              } else if (parsed.m === 'set_symbol' && Array.isArray(parsed.p) && parsed.p.length >= 3) {
                const seriesId = parsed.p[1];
                const rawSymbol = parsed.p[2];
                if (typeof rawSymbol === 'string' && rawSymbol.length > 2) {
                  const symbol = this.formatSymbol(rawSymbol);
                  if (!this.isMetadataSymbol(symbol)) {
                    this.seriesMap[seriesId] = symbol;
                    this.currentSymbol = symbol;
                    console.log(`[TradingView] set_symbol mapped series ${seriesId} to symbol ${symbol}`);
                  }
                }
              } else if (parsed.m === 'resolve_symbol' && Array.isArray(parsed.p) && parsed.p.length >= 3) {
                const symbolId = parsed.p[1];
                const rawSymbol = parsed.p[2];
                if (typeof rawSymbol === 'string') {
                  const symbol = this.formatSymbol(rawSymbol);
                  if (!this.isMetadataSymbol(symbol)) {
                    this.symbolMap[symbolId] = symbol;
                    console.log(`[TradingView] Mapped symbolId ${symbolId} to symbol ${symbol}`);
                  }
                }
              }
            } catch (inner) {}
          }
        }
      } catch (err) {}
      return null;
    }

    if (direction !== 'incoming') return null;

    try {
      if (payload.includes('~m~')) {
        const parts = payload.split(/~m~\d+~m~/);
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          
          try {
            const parsed = JSON.parse(trimmed);
            
            // 1. Handle quote updates (qsd)
            if (parsed.m === 'qsd' && Array.isArray(parsed.p) && parsed.p.length >= 2) {
              const quoteData = parsed.p[1];
              if (quoteData && quoteData.v) {
                const symbol = this.formatSymbol(quoteData.n || parsed.p[0]);
                if (this.isMetadataSymbol(symbol)) continue;

                if (symbol !== this.currentSymbol) continue;

                const price = Number(quoteData.v.lp || quoteData.v.ask || quoteData.v.bid);
                if (isNaN(price)) continue;
                
                return {
                  schema: 1,
                  provider: 'tradingview',
                  symbol,
                  timestamp: Date.now(),
                  open: price,
                  high: price,
                  low: price,
                  close: price,
                  price: price,
                  volume: Number(quoteData.v.volume || 0),
                  timeframe: 'tick',
                  source: 'tv_qsd'
                };
              }
            }

            // 2. Handle timescale (candle) updates
            if ((parsed.m === 'timescale_update' || parsed.m === 'du') && Array.isArray(parsed.p) && parsed.p.length >= 2) {
              const seriesObj = parsed.m === 'timescale_update' ? parsed.p[1].s : parsed.p[1];
              if (seriesObj && typeof seriesObj === 'object') {
                for (const seriesId in seriesObj) {
                  const node = seriesObj[seriesId];
                  if (node && Array.isArray(node.v)) {
                    const symbol = this.seriesMap[seriesId] || this.currentSymbol;
                    if (this.isMetadataSymbol(symbol)) continue;

                    const candleValues = node.v;
                    const results = [];
                    for (let idx = 0; idx < candleValues.length; idx++) {
                      const candleArray = candleValues[idx];
                      if (Array.isArray(candleArray) && candleArray.length >= 6) {
                        const [timeIndex, o, h, l, c, v] = candleArray;
                        
                        let timestamp = timeIndex;
                        if (timestamp < 10000000000) {
                          timestamp = timestamp * 1000;
                        }
                        
                        const isHistorical = idx < candleValues.length - 1;
                        
                        results.push({
                          schema: 1,
                          provider: 'tradingview',
                          symbol,
                          timestamp,
                          open: Number(o),
                          high: Number(h),
                          low: Number(l),
                          close: Number(c),
                          price: Number(c),
                          volume: Number(v || 0),
                          timeframe: '1m',
                          source: isHistorical ? 'tv_timescale_historical' : 'tv_timescale',
                          isHistorical
                        });
                      }
                    }
                    if (results.length > 0) {
                      return results[results.length - 1];
                    }
                  }
                }
              }
            }
          } catch (e) {
            // ignore inner parse errors
          }
        }
      }
    } catch (err) {
      // ignore outer error
    }
    return null;
  }

  formatSymbol(raw) {
    return normalizeSymbol(raw);
  }
}

export default TradingViewProvider;
