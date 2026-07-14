export class TickAggregator {
  constructor() {
    this.streams = new Map();
  }

  _initSymbol(symbol) {
    if (!this.streams.has(symbol)) {
      this.streams.set(symbol, {
        currentCandle: null,
        last200: []
      });
    }
    return this.streams.get(symbol);
  }

  onTick(tick) {
    const symbol = tick.symbol;
    const stream = this._initSymbol(symbol);
    const price = tick.price;
    const timestamp = tick.timestamp;
    
    // Calculate the start of the current minute (e.g. 15:37:00.000)
    const minuteBucket = Math.floor(timestamp / 60000) * 60000;

    let current = stream.currentCandle;

    if (!current || minuteBucket > current.timestamp) {
      // Minute changed or first tick ever
      if (current) {
        stream.last200.push(current);
        if (stream.last200.length > 200) {
          stream.last200.shift();
        }
      }
      
      // Start new candle
      stream.currentCandle = {
        symbol: symbol,
        timestamp: minuteBucket,
        open: price,
        high: price,
        low: price,
        close: price,
        timeframe: '1m',
        volume: tick.volume || 1,
        source: tick.source || 'ws',
        price: price
      };
      
      return { minuteChanged: true, symbol };
    } else {
      // Update existing candle
      current.high = Math.max(current.high, price);
      current.low = Math.min(current.low, price);
      current.close = price;
      current.price = price;
      current.volume += tick.volume || 1;
      
      return { minuteChanged: false, symbol };
    }
  }

  getCurrentCandle(symbol) {
    const stream = this.streams.get(symbol);
    return stream && stream.currentCandle ? { ...stream.currentCandle } : null;
  }

  pushCompletedCandle(candle) {
    if (!candle) return;
    const symbol = candle.symbol || 'BTC/USD';
    const stream = this._initSymbol(symbol);
    
    stream.last200.push(candle);
    if (stream.last200.length > 200) {
      stream.last200.shift();
    }
  }

  getCandles(symbol) {
    const stream = this.streams.get(symbol);
    if (!stream) return [];
    
    const all = stream.last200.map(c => ({ ...c }));
    if (stream.currentCandle) {
      all.push({ ...stream.currentCandle });
    }
    return all;
  }

  getLatestCandle(symbol) {
    const stream = this.streams.get(symbol);
    if (!stream) return null;
    
    if (stream.currentCandle) return { ...stream.currentCandle };
    if (stream.last200.length > 0) return { ...stream.last200[stream.last200.length - 1] };
    return null;
  }
}

export const tickAggregator = new TickAggregator();
