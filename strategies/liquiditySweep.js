import BaseStrategy from './baseStrategy.js';

export default class LiquiditySweepStrategy extends BaseStrategy {
  constructor() {
    super(
      'Liquidity Sweep',
      'Advanced sweep strategy looking for liquidity grabs below previous lows with high momentum and volume backing.'
    );
  }

  evaluate(candles, ticks) {
    if (!candles || candles.length < 25) return super.evaluate(candles, ticks);

    const current = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const prev5 = candles.slice(-6, -1);
    const prev10 = candles.slice(-11, -1);
    const prev20 = candles.slice(-21, -1);

    const range = current.high - current.low;
    if (range === 0) return super.evaluate(candles, ticks);

    // ----------------------------------------------------
    // 1. Current Candle Checks
    // ----------------------------------------------------
    const isBullish = current.close > current.open;
    const lowerWick = Math.min(current.open, current.close) - current.low;
    const lowerWickRatio = lowerWick / range;
    const bodyRatio = Math.abs(current.close - current.open) / range;
    const closeInTop10 = (current.high - current.close) / range <= 0.10;

    // Median range of previous 20 candles
    const prevRanges = prev20.map(c => c.high - c.low).sort((a, b) => a - b);
    const medianRange = prevRanges[Math.floor(prevRanges.length / 2)];
    const rangeExpansionRatio = range / (medianRange || 1);

    // ----------------------------------------------------
    // 2. Previous 5 Candles Checks
    // ----------------------------------------------------
    const bearishCount = prev5.filter(c => c.close < c.open).length;
    
    // Check for descending lows
    let lowsDescending = true;
    for (let i = 1; i < prev5.length; i++) {
      if (prev5[i].low > prev5[i-1].low) {
        lowsDescending = false;
        break;
      }
    }

    // Volatility slope (regression-free simple checks)
    const volFirstHalf = (prev5[0].high - prev5[0].low) + (prev5[1].high - prev5[1].low);
    const volSecondHalf = (prev5[3].high - prev5[3].low) + (prev5[4].high - prev5[4].low);
    const decliningVolatility = volSecondHalf < volFirstHalf;

    // Upper wick check
    const noLargeUpperWicks = prev5.every(c => {
      const r = c.high - c.low;
      if (r === 0) return true;
      const upper = c.high - Math.max(c.open, c.close);
      return (upper / r) < 0.20;
    });

    // ----------------------------------------------------
    // 3. Market Structure Checks
    // ----------------------------------------------------
    const lowestOfLast10 = Math.min(...prev10.map(c => c.low));
    const sweepsLowestOfLast10 = current.low < lowestOfLast10;
    const closesAbovePrevLow = current.close > prevCandle.low;
    const breaksPrevHigh = current.high > prevCandle.high;
    const higherLow = current.low > prevCandle.low; // Higher low relative to previous

    // ----------------------------------------------------
    // 4. Momentum & Ticks
    // ----------------------------------------------------
    let tickVelocityDouble = false;
    let accelerationIncreasing = false;
    let pctAboveVWAP = 0.50;

    // Process ticks for the active candle timeframe
    const activeTicks = ticks.filter(t => t.timestamp >= current.timestamp);
    if (activeTicks.length >= 10) {
      const len = activeTicks.length;
      
      // Calculate split velocities (first 80% vs final 20% of duration)
      const duration = Date.now() - current.timestamp;
      const boundaryTime = current.timestamp + (duration * 0.80);
      const earlyTicks = activeTicks.filter(t => t.timestamp < boundaryTime);
      const lateTicks = activeTicks.filter(t => t.timestamp >= boundaryTime);

      const earlyRate = earlyTicks.length / (duration * 0.80 || 1);
      const lateRate = lateTicks.length / (duration * 0.20 || 1);
      tickVelocityDouble = lateRate > (earlyRate * 1.5);

      // Average acceleration
      let accCount = 0;
      for (let i = 2; i < Math.min(len, 10); i++) {
        const d1 = activeTicks[len - i].price - activeTicks[len - i - 1].price;
        const d2 = activeTicks[len - i - 1].price - activeTicks[len - i - 2].price;
        if (Math.abs(d1) > Math.abs(d2)) accCount++;
      }
      accelerationIncreasing = accCount >= 4;

      // VWAP approximation
      let sumPriceVol = 0;
      let sumVol = 0;
      activeTicks.forEach(t => {
        sumPriceVol += t.price;
        sumVol += 1;
      });
      const vwap = sumPriceVol / (sumVol || 1);
      const ticksAboveVWAP = activeTicks.filter(t => t.price > vwap).length;
      pctAboveVWAP = ticksAboveVWAP / len;
    }

    // ----------------------------------------------------
    // 5. Statistics (Percentiles)
    // ----------------------------------------------------
    // Calculate percentiles dynamically over history
    const allCandleRanges = candles.map(c => c.high - c.low).sort((a, b) => a - b);
    const rangeIndex = allCandleRanges.indexOf(range);
    const rangePercentile = rangeIndex / allCandleRanges.length;

    const allWickRatios = candles.map(c => {
      const r = c.high - c.low;
      return r > 0 ? ((Math.min(c.open, c.close) - c.low) / r) : 0;
    }).sort((a, b) => a - b);
    const wickIndex = allWickRatios.indexOf(lowerWickRatio);
    const wickPercentile = wickIndex / allWickRatios.length;

    // ----------------------------------------------------
    // 6. Quality Scoring System
    // ----------------------------------------------------
    let scoreTrend = 0;      // Max 20
    let scoreLiquidity = 0;  // Max 20
    let scoreMomentum = 0;   // Max 20
    let scoreVolatility = 0; // Max 15
    let scoreStructure = 0;  // Max 25

    // Trend Score (Max 20)
    if (bearishCount >= 3) scoreTrend += 10;
    if (lowsDescending) scoreTrend += 10;

    // Liquidity Score (Max 20)
    if (sweepsLowestOfLast10) scoreLiquidity += 12;
    if (wickPercentile >= 0.85) scoreLiquidity += 8;

    // Momentum Score (Max 20)
    if (isBullish) scoreMomentum += 5;
    if (closeInTop10) scoreMomentum += 5;
    if (pctAboveVWAP > 0.65) scoreMomentum += 5;
    if (tickVelocityDouble || accelerationIncreasing) scoreMomentum += 5;

    // Volatility Score (Max 15)
    if (rangeExpansionRatio > 1.5) scoreVolatility += 8;
    if (decliningVolatility) scoreVolatility += 7;

    // Structure Score (Max 25)
    if (closesAbovePrevLow) scoreStructure += 10;
    if (breaksPrevHigh) scoreStructure += 10;
    if (higherLow || noLargeUpperWicks) scoreStructure += 5;

    const totalScore = scoreTrend + scoreLiquidity + scoreMomentum + scoreVolatility + scoreStructure;

    const reasons = [];
    if (bearishCount >= 3) reasons.push("Bearish Trend");
    if (lowsDescending) reasons.push("Descending Lows");
    if (sweepsLowestOfLast10) reasons.push("Liquidity Sweep");
    if (wickPercentile >= 0.85) reasons.push("High Lower Wick Expansion");
    if (isBullish) reasons.push("Bullish Close");
    if (closeInTop10) reasons.push("Close in Top 10%");
    if (pctAboveVWAP > 0.65) reasons.push("High VWAP Accumulation");
    if (tickVelocityDouble || accelerationIncreasing) reasons.push("Momentum Acceleration");
    if (rangeExpansionRatio > 1.5) reasons.push("Volatility ATR Expansion");
    if (decliningVolatility) reasons.push("Volatility Contraction");
    if (closesAbovePrevLow) reasons.push("Close Above Previous Low");
    if (breaksPrevHigh) reasons.push("Bullish BOS (Break of Structure)");

    return {
      triggered: totalScore >= 96,
      confidence: totalScore,
      score: totalScore,
      reasons: reasons,
      metrics: {
        trend: scoreTrend,
        liquidity: scoreLiquidity,
        momentum: scoreMomentum,
        volatility: scoreVolatility,
        structure: scoreStructure,
        lowerWickRatio: Number(lowerWickRatio.toFixed(3)),
        bodyRatio: Number(bodyRatio.toFixed(3)),
        rangeExpansion: Number(rangeExpansionRatio.toFixed(2))
      },
      risk: Math.max(5, Math.round(100 - totalScore * 0.9)),
      cooldown: 300,
      direction: 'bullish'
    };
  }
}
