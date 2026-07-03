import LiquiditySweepStrategy from './liquiditySweep.js';
import CompressionBreakoutStrategy from './breakout.js';
import TrendContinuationStrategy from './trendContinuation.js';
import MeanReversionStrategy from './meanReversion.js';

export const STRATEGIES = {
  'Liquidity Sweep': new LiquiditySweepStrategy(),
  'Compression Breakout': new CompressionBreakoutStrategy(),
  'Trend Continuation': new TrendContinuationStrategy(),
  'Mean Reversion': new MeanReversionStrategy()
};

export default STRATEGIES;
