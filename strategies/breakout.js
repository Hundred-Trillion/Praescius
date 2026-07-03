import BaseStrategy from './baseStrategy.js';

export default class CompressionBreakoutStrategy extends BaseStrategy {
  constructor() {
    super(
      'Compression Breakout',
      'Identifies periods of low-volatility compression followed by high-momentum breakout expansion.'
    );
  }

  evaluate(candles, ticks) {
    if (!candles || candles.length < 15) {
      return super.evaluate(candles, ticks);
    }

    const current = candles[candles.length - 1];
    const prevCandles = candles.slice(-11, -1);
    const range = current.high - current.low;

    // Calculate ranges of previous candles
    const prevRanges = prevCandles.map(c => c.high - c.low);
    const avgPrevRange = prevRanges.reduce((s, r) => s + r, 0) / prevRanges.length;

    // Check compression on previous 5 candles (preceding current)
    const compressionCandles = prevCandles.slice(-5);
    const compressionRanges = compressionCandles.map(c => c.high - c.low);
    const isCompressed = compressionRanges.every(r => r < avgPrevRange * 0.85);

    // Current candle range expansion
    const rangeExpansion = range / (avgPrevRange || 1);
    const hasExpansion = rangeExpansion > 1.7;

    // Break of structure: closes above max high of last 5 or below min low of last 5
    const highs = compressionCandles.map(c => c.high);
    const lows = compressionCandles.map(c => c.low);
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    
    const breakUp = current.close > maxHigh;
    const breakDown = current.close < minLow;
    const isBreakout = breakUp || breakDown;

    // Tick volume / rate acceleration check
    let tickAcceleration = false;
    const activeTicks = ticks.filter(t => t.timestamp >= current.timestamp);
    if (activeTicks.length >= 6) {
      const len = activeTicks.length;
      const recentTicks = activeTicks.slice(-3);
      const earlyTicks = activeTicks.slice(0, 3);
      
      const recentSpeed = Math.abs(recentTicks[2].price - recentTicks[0].price);
      const earlySpeed = Math.abs(earlyTicks[2].price - earlyTicks[0].price);
      tickAcceleration = recentSpeed > earlySpeed * 1.5;
    }

    // Scoring
    let score = 10;
    const reasons = [];

    if (isCompressed) {
      score += 30;
      reasons.push("Volatility Compression");
    }
    if (hasExpansion) {
      score += 30;
      reasons.push("Range Expansion");
    }
    if (isBreakout) {
      score += 20;
      reasons.push(breakUp ? "Upside Breakout" : "Downside Breakout");
    }
    if (tickAcceleration) {
      score += 10;
      reasons.push("Tick Speed Acceleration");
    }

    return {
      triggered: score >= 90,
      confidence: score,
      score: score,
      reasons: reasons,
      metrics: {
        rangeExpansion: Number(rangeExpansion.toFixed(2)),
        isCompressed: isCompressed ? 1 : 0,
        isBreakout: isBreakout ? 1 : 0
      },
      risk: Math.max(5, Math.round(100 - score * 0.85)),
      cooldown: 180,
      direction: breakUp ? 'bullish' : (breakDown ? 'bearish' : 'neutral')
    };
  }
}
