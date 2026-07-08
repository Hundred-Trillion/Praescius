import BaseStrategy from './baseStrategy.js';

export default class MeanReversionStrategy extends BaseStrategy {
  constructor() {
    super(
      'Mean Reversion',
      'Detects extreme overbought/oversold conditions using RSI and targets mean reversion opportunities.'
    );
  }

  evaluate(candles, ticks) {
    if (!candles || candles.length < 16) {
      return super.evaluate(candles, ticks);
    }

    const current = candles[candles.length - 1];
    const closes = candles.map(c => c.close);

    // Calculate RSI-14
    const rsi = this.calculateRSI(closes, 14);

    const overbought = rsi > 70;
    const oversold = rsi < 30;
    const extremeOverbought = rsi > 80;
    const extremeOversold = rsi < 20;

    // Trigger: Reversal candle from extremes
    const isBullish = current.close > current.open;
    const isBearish = current.close < current.open;
    const reversionTrigger = (oversold && isBullish) || (overbought && isBearish);

    // Ticks exhaustion: decreasing tick velocity near extremes
    let exhaustion = false;
    const activeTicks = ticks.filter(t => t.timestamp >= current.timestamp);
    if (activeTicks.length >= 8) {
      const len = activeTicks.length;
      const duration = Date.now() - current.timestamp;
      const boundaryTime = current.timestamp + (duration * 0.50);
      const firstHalf = activeTicks.filter(t => t.timestamp < boundaryTime);
      const secondHalf = activeTicks.filter(t => t.timestamp >= boundaryTime);
      
      const firstVol = firstHalf.length;
      const secondVol = secondHalf.length;
      exhaustion = secondVol < firstVol * 0.7; // 30% drop in tick rate
    }

    // Scoring
    let score = 10;
    const reasons = [];

    if (overbought || oversold) {
      score += 30;
      reasons.push(overbought ? "RSI Overbought (>70)" : "RSI Oversold (<30)");
    }
    if (extremeOverbought || extremeOversold) {
      score += 20;
      reasons.push(extremeOverbought ? "Extreme Overbought (>80)" : "Extreme Oversold (<20)");
    }
    if (reversionTrigger) {
      score += 25;
      reasons.push("Reversion Candle Triggered");
    }
    if (exhaustion) {
      score += 15;
      reasons.push("Tick Volume Exhaustion");
    }

    return {
      triggered: score >= 85,
      confidence: score,
      score: score,
      reasons: reasons,
      metrics: {
        rsi: Number(rsi.toFixed(2)),
        extreme: (extremeOverbought || extremeOversold) ? 1 : 0,
        trigger: reversionTrigger ? 1 : 0
      },
      risk: Math.max(5, Math.round(100 - score * 0.9)),
      cooldown: 200,
      direction: oversold ? 'bullish' : (overbought ? 'bearish' : 'neutral')
    };
  }

  calculateRSI(closes, period = 14) {
    if (closes.length <= period) return 50;
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const diff = closes[closes.length - i] - closes[closes.length - i - 1];
      if (diff > 0) {
        gains += diff;
      } else {
        losses -= diff;
      }
    }
    
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }
}
