import BaseStrategy from './baseStrategy.js';

export default class TrendContinuationStrategy extends BaseStrategy {
  constructor() {
    super(
      'Trend Continuation',
      'Follows strong established trends by detecting pullbacks and continuation triggers using short/medium/long term moving averages.'
    );
  }

  evaluate(candles, ticks) {
    if (!candles || candles.length < 20) {
      return super.evaluate(candles, ticks);
    }

    const current = candles[candles.length - 1];
    const closes = candles.map(c => c.close);
    
    // Calculate short, medium, long term simple averages
    const shortAvg = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const mediumAvg = closes.slice(-12).reduce((a, b) => a + b, 0) / 12;
    const longAvg = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;

    const uptrend = shortAvg > mediumAvg && mediumAvg > longAvg;
    const downtrend = shortAvg < mediumAvg && mediumAvg < longAvg;
    const hasTrend = uptrend || downtrend;

    // Pullback check: previous candle pulled back close to mediumAvg
    const prevClose = closes[closes.length - 2];
    const prevPullback = uptrend ? (prevClose <= mediumAvg * 1.01) : (prevClose >= mediumAvg * 0.99);

    // Continuation check: current candle closes strongly in trend direction
    const isBullish = current.close > current.open;
    const isBearish = current.close < current.open;
    const continuationTrigger = (uptrend && isBullish) || (downtrend && isBearish);

    // Scoring
    let score = 15;
    const reasons = [];

    if (hasTrend) {
      score += 40;
      reasons.push(uptrend ? "Bullish Trend Alignment" : "Bearish Trend Alignment");
    }
    if (prevPullback) {
      score += 25;
      reasons.push("Mean Pullback Detected");
    }
    if (continuationTrigger) {
      score += 15;
      reasons.push("Trend Resumption Trigger");
    }

    return {
      triggered: score >= 90,
      confidence: score,
      score: score,
      reasons: reasons,
      metrics: {
        trendDir: uptrend ? 1 : (downtrend ? -1 : 0),
        pullback: prevPullback ? 1 : 0,
        resumption: continuationTrigger ? 1 : 0
      },
      risk: Math.max(5, Math.round(100 - score * 0.8)),
      cooldown: 120,
      direction: uptrend ? 'bullish' : (downtrend ? 'bearish' : 'neutral')
    };
  }
}
