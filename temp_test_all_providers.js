import { QuotexProvider } from './providers/quotex/index.js';
import { BinanceProvider } from './providers/binance/index.js';
import { TradingViewProvider } from './providers/tradingview/index.js';
import { PocketOptionProvider } from './providers/pocketoption/index.js';
import { BybitProvider } from './providers/bybit/index.js';
import { evaluateRule } from './core/evaluator.js';
import { compileRule } from './core/compiler.js';
import LiquiditySweepStrategy from './strategies/liquiditySweep.js';
import ConsensusEngine from './engine/ConsensusEngine.js';

let failed = 0;
console.log('=== STARTING ALL SCOPED PROVIDERS PARSER VERIFICATION ===\n');

// Initialize providers
const quotex = new QuotexProvider();
const pocketOption = new PocketOptionProvider();
const binance = new BinanceProvider();
const bybit = new BybitProvider();
const tradingview = new TradingViewProvider();

const runTest = (name, assertFn) => {
  try {
    assertFn();
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name} ->`, err.message);
    failed++;
  }
};

// 1. Quotex String & Binary test
runTest('Quotex - Parse text frame', () => {
  const payload = '42["quotes",{"asset":"BTCUSD_OTC","price":68120.50,"time":1719876540}]';
  const result = quotex.parse(payload, 'incoming');
  if (!result || result.symbol !== 'BTC/USD (OTC)' || result.price !== 68120.50) {
    throw new Error(`Invalid output: ${JSON.stringify(result)}`);
  }
});

runTest('Quotex - Parse binary frame (Uint8Array)', () => {
  const rawText = '42["quotes",{"asset":"EURUSD_OTC","price":1.0845,"time":1719876540}]';
  const encoder = new TextEncoder();
  const binaryPayload = encoder.encode(rawText);
  const result = quotex.parse(binaryPayload, 'incoming');
  if (!result || result.symbol !== 'EUR/USD (OTC)' || result.price !== 1.0845) {
    throw new Error(`Binary decode failed: ${JSON.stringify(result)}`);
  }
});

runTest('Quotex - Parse positional binary tuple frame', () => {
  const payload = '[["ATOUSD_otc",1783090072.115,1.5095,0]]';
  const result = quotex.parse(payload, 'incoming');
  if (!result || result.symbol !== 'ATO/USD (OTC)' || result.price !== 1.5095 || result.timestamp !== 1783090072115) {
    throw new Error(`Positional tuple parse failed: ${JSON.stringify(result)}`);
  }
});

// 2. Pocket Option String & Binary test
runTest('Pocket Option - Parse text frame', () => {
  const payload = '42["quotes",{"asset":"EURUSD","price":1.0845,"time":1719876540}]';
  const result = pocketOption.parse(payload, 'incoming');
  if (!result || result.symbol !== 'EUR/USD' || result.price !== 1.0845) {
    throw new Error(`Invalid output: ${JSON.stringify(result)}`);
  }
});

runTest('Pocket Option - Parse positional binary tuple frame', () => {
  const payload = '[["EURUSD", 1.0845, 1719876540]]';
  const result = pocketOption.parse(payload, 'incoming');
  if (!result || result.symbol !== 'EUR/USD' || result.price !== 1.0845 || result.timestamp !== 1719876540000) {
    throw new Error(`Positional tuple parse failed: ${JSON.stringify(result)}`);
  }
});

runTest('Pocket Option - Parse binary frame (ArrayBuffer)', () => {
  const rawText = '42["quotes",{"asset":"GBPUSD","price":1.2720,"time":1719876540}]';
  const encoder = new TextEncoder();
  const binaryPayload = encoder.encode(rawText).buffer; // ArrayBuffer
  const result = pocketOption.parse(binaryPayload, 'incoming');
  if (!result || result.symbol !== 'GBP/USD' || result.price !== 1.2720) {
    throw new Error(`Binary decode failed: ${JSON.stringify(result)}`);
  }
});

// 3. Binance tests
runTest('Binance - Kline Stream', () => {
  const payload = JSON.stringify({
    e: 'kline',
    s: 'BTCUSDT',
    k: { t: 1719876500000, o: '68100.00', c: '68120.50', h: '68150.00', l: '68050.00', v: '12.5', i: '1m' }
  });
  const result = binance.parse(payload, 'incoming');
  if (!result || result.symbol !== 'BTC/USDT' || result.price !== 68120.50 || result.open !== 68100.00) {
    throw new Error(`Invalid output: ${JSON.stringify(result)}`);
  }
});

runTest('Binance - MiniTicker Stream', () => {
  const payload = JSON.stringify({
    e: '24hrMiniTicker',
    s: 'ETHUSDT',
    E: 1719876540000,
    o: '3500.00',
    c: '3510.50',
    h: '3520.00',
    l: '3490.00',
    v: '100.2'
  });
  const result = binance.parse(payload, 'incoming');
  if (!result || result.symbol !== 'ETH/USDT' || result.price !== 3510.50) {
    throw new Error(`Invalid output: ${JSON.stringify(result)}`);
  }
});

// 4. Bybit tests
runTest('Bybit - Kline Update', () => {
  const payload = JSON.stringify({
    topic: 'kline.1.BTCUSDT',
    data: [{ start: 1719876500000, open: '68100.00', close: '68120.50', high: '68150.00', low: '68050.00', volume: '12.5' }]
  });
  const result = bybit.parse(payload, 'incoming');
  if (!result || result.symbol !== 'BTC/USDT' || result.price !== 68120.50) {
    throw new Error(`Invalid output: ${JSON.stringify(result)}`);
  }
});

runTest('Bybit - Trade Stream', () => {
  const payload = JSON.stringify({
    topic: 'publicTrade.SOLUSDT',
    data: [{ p: '142.50', v: '10', T: 1719876540000 }]
  });
  const result = bybit.parse(payload, 'incoming');
  if (!result || result.symbol !== 'SOL/USDT' || result.price !== 142.50) {
    throw new Error(`Invalid output: ${JSON.stringify(result)}`);
  }
});

// 5. TradingView Outgoing Series mapping + Timescale/Quotes isolation
runTest('TradingView - Outgoing create_series Mapping', () => {
  // Simulate outgoing create_series message
  const payload = '~m~150~m~{"m":"create_series","p":["cs_1", "s1", "s1", "BINANCE:BTCUSDT", "1m", 300]}';
  tradingview.parse(payload, 'outgoing');
  
  // Verify that s1 series ID mapped to BTC/USDT
  if (tradingview.seriesMap['s1'] !== 'BTC/USDT') {
    throw new Error(`Series mapping failed: ${tradingview.seriesMap['s1']}`);
  }
});

runTest('TradingView - Outgoing set_symbol Mapping', () => {
  const payload = '~m~120~m~{"m":"set_symbol","p":["cs_1", "s2", "BINANCE:ETHUSDT"]}';
  tradingview.parse(payload, 'outgoing');
  if (tradingview.seriesMap['s2'] !== 'ETH/USDT') {
    throw new Error(`Set symbol mapping failed: ${tradingview.seriesMap['s2']}`);
  }
});

runTest('TradingView - Ignore splits/metadata', () => {
  const payload = '~m~150~m~{"m":"create_series","p":["cs_1", "s3", "s3", "SPLITS", "1m", 300]}';
  tradingview.parse(payload, 'outgoing');
  if (tradingview.seriesMap['s3'] !== undefined) {
    throw new Error(`Failed to ignore SPLITS metadata symbol.`);
  }
});

runTest('TradingView - Parse timescale update using mapped series', () => {
  // Incoming timescale_update for s1 (mapped to BTC/USDT)
  const payload = '~m~250~m~{"m":"timescale_update","p":["cs_1",{"s":{"s1":{"v":[[1719876540, 68100, 68150, 68050, 68120.50, 15.4]]}}}]}' ;
  const result = tradingview.parse(payload, 'incoming');
  if (!result || result.symbol !== 'BTC/USDT' || result.price !== 68120.50 || result.source !== 'tv_timescale') {
    throw new Error(`Failed to parse timescale using mapped series: ${JSON.stringify(result)}`);
  }
});

runTest('TradingView - Parse historical multi-candle update', () => {
  // Incoming du with multiple candles for s2 (mapped to ETH/USDT)
  const payload = '~m~400~m~{"m":"du","p":["cs_1",{"s2":{"v":[[1719876000, 3500, 3510, 3490, 3505, 10], [1719876060, 3505, 3520, 3500, 3515, 12]]}}]}';
  const result = tradingview.parse(payload, 'incoming');
  
  // Latest candle in the array is the one returned
  if (!result || result.symbol !== 'ETH/USDT' || result.price !== 3515.00) {
    throw new Error(`Timescale du parsing failed: ${JSON.stringify(result)}`);
  }
  
  // Note: the test suite calls parse directly, which returns the latest candle.
});

runTest('TradingView - Parse qsd updates (active chart vs watchlist)', () => {
  // 1. Watchlist update (BTCUSDT) should be ignored when active chart is ETH/USDT
  const btcPayload = '~m~150~m~{"m":"qsd","p":["qse_1",{"n":"BINANCE:BTCUSDT","v":{"lp":68120.50}}]}';
  const btcResult = tradingview.parse(btcPayload, 'incoming');
  if (btcResult !== null) {
    throw new Error(`Watchlist quote update was not ignored: ${JSON.stringify(btcResult)}`);
  }

  // 2. Active chart update (ETHUSDT) should be parsed
  const ethPayload = '~m~150~m~{"m":"qsd","p":["qse_1",{"n":"BINANCE:ETHUSDT","v":{"lp":3510.50}}]}';
  const ethResult = tradingview.parse(ethPayload, 'incoming');
  if (!ethResult || ethResult.symbol !== 'ETH/USDT' || ethResult.price !== 3510.50) {
    throw new Error(`Active chart quote update failed to parse: ${JSON.stringify(ethResult)}`);
  }
});

runTest('Evaluator - Candle Geometry checks (wick ratio, close vs open)', () => {
  const candles = [
    {
      open: 100,
      high: 150,
      low: 80,
      close: 90, // Bearish: close < open. body = 10, totalRange = 70.
      // upperWick = high - max(open, close) = 150 - 100 = 50. upperWickRatio = 50 / 70 = 0.714 (71.4% > 50%)
      timestamp: Date.now()
    }
  ];

  const rule = {
    name: 'Test rule',
    operator: 'AND',
    conditions: [
      {
        indicator: 'Candle',
        property: 'upperWickRatio',
        operator: '>',
        value: 0.5
      },
      {
        indicator: 'Candle',
        property: 'close',
        operator: '<',
        value: 'open'
      }
    ]
  };

  const matched = evaluateRule(candles, rule);
  if (!matched) {
    throw new Error('Candle geometry evaluation failed to match a valid bearish pinbar.');
  }

  // Verify that a bullish candle fails
  const invalidCandles = [
    {
      open: 100,
      high: 110,
      low: 95,
      close: 105, // Bullish
      timestamp: Date.now()
    }
  ];
  const matchedInvalid = evaluateRule(invalidCandles, rule);
  if (matchedInvalid) {
    throw new Error('Candle geometry evaluation falsely matched a bullish candle.');
  }
});

runTest('Compiler - Candle Geometry Rule Validation', () => {
  const rawRule = {
    name: 'Bearish pinbar alert',
    operator: 'AND',
    conditions: [
      {
        indicator: 'Candle',
        property: 'upperWickRatio',
        operator: '>',
        value: 0.5
      },
      {
        indicator: 'Candle',
        property: 'close',
        operator: '<',
        value: 'open'
      }
    ]
  };

  const compiled = compileRule(rawRule);
  if (!compiled || compiled.conditions.length !== 2) {
    throw new Error('Failed to compile a valid Candle indicator rule structure.');
  }

  // Check invalid structure throws
  try {
    compileRule({
      name: 'Invalid candle rule',
      conditions: [{ indicator: 'Candle', property: 'invalidProp', operator: '>', value: 10 }]
    });
    throw new Error('Compiler failed to block unsupported Candle property.');
  } catch (e) {
    // Expected exception
  }
});

runTest('Compiler & Evaluator - Previous Candle Properties (prevClose)', () => {
  const rawRule = {
    name: 'Rising Close Alert',
    operator: 'AND',
    conditions: [
      {
        indicator: 'Candle',
        property: 'close',
        operator: '>',
        value: 'prevClose'
      }
    ]
  };

  const compiled = compileRule(rawRule);
  if (!compiled || compiled.conditions[0].value !== 'prevClose') {
    throw new Error('Failed to compile candle comparison to prevClose.');
  }

  const candles = [
    { open: 100, high: 105, low: 98, close: 102, timestamp: Date.now() - 60000 }, // prevClose = 102
    { open: 102, high: 110, low: 101, close: 104, timestamp: Date.now() }        // close = 104
  ];

  const matched = evaluateRule(candles, compiled);
  if (!matched) {
    throw new Error('Evaluator failed to match close > prevClose where 104 > 102.');
  }

  const invalidCandles = [
    { open: 100, high: 105, low: 98, close: 102, timestamp: Date.now() - 60000 }, // prevClose = 102
    { open: 102, high: 105, low: 95, close: 101, timestamp: Date.now() }         // close = 101
  ];

  const matchedInvalid = evaluateRule(invalidCandles, compiled);
  if (matchedInvalid) {
    throw new Error('Evaluator falsely matched close > prevClose where 101 < 102.');
  }
});

runTest('Strategies - Custom Quantitative Liquidity Sweep Plugin', () => {
  const strategy = new LiquiditySweepStrategy();

  // Create 20 baseline candles
  const candles = [];
  const baseTime = Date.now() - 30 * 60000;
  for (let i = 0; i < 20; i++) {
    candles.push({
      open: 100,
      high: 105,
      low: 95,
      close: 101,
      timestamp: baseTime + i * 60000
    });
  }

  // Add 5 previous descending low/bearish candles with declining volatility and no large upper wicks
  // Lows: 90, 88, 86, 84, 82
  // Volatility ranges: 12, 11, 10, 9, 8
  const lows = [90, 88, 86, 84, 82];
  const ranges = [12, 11, 10, 9, 8];
  for (let i = 0; i < 5; i++) {
    candles.push({
      open: lows[i] + ranges[i] - 0.5,
      high: lows[i] + ranges[i],
      low: lows[i],
      close: lows[i] + 1, // Highly bearish
      timestamp: baseTime + (20 + i) * 60000
    });
  }

  // Current Candle: Sweeps the previous low (82), high range expansion, bullish, wick >= 65%, body 30-60%
  // open = 116, close = 146, low = 50 (sweeps 82), high = 150 (range = 100)
  // Lower wick = 116 - 50 = 66 -> 66% of range
  // Body = 146 - 116 = 30 -> 30% of range
  // Close position = 150 - 146 = 4 -> 4% of range (within top 10%)
  const currentCandle = {
    open: 116,
    high: 150,
    low: 50,
    close: 146,
    timestamp: Date.now() - 30000
  };
  candles.push(currentCandle);

  // Mock ticks for acceleration, velocity doubling, and vwap checks
  const ticks = [];
  const tickTime = Date.now() - 30000;
  
  // First 10 ticks (0 to 24s) - price starts low (sweep) then jumps high
  for (let i = 0; i < 10; i++) {
    ticks.push({
      price: i < 3 ? 50 : 140,
      timestamp: tickTime + (i * 2400)
    });
  }
  // Last 10 ticks (24s to 30s) - price accelerating up to 146
  for (let i = 0; i < 10; i++) {
    ticks.push({
      price: 141 + (i * i * 0.05) + (i * 0.1),
      timestamp: tickTime + 24000 + (i * 600)
    });
  }

  const result = strategy.evaluate(candles, ticks);
  console.log('STRATEGY EVALUATION RESULT:', JSON.stringify(result, null, 2));
  if (!result || !result.triggered) {
    throw new Error('Strategy failed to trigger under mathematically perfect sweep conditions.');
  }

  if (result.score < 96) {
    throw new Error(`Strategy triggered but score was ${result.score} (< 96).`);
  }

  // Verify failure on baseline only
  const baseOnlyResult = strategy.evaluate(candles.slice(0, 20), ticks);
  if (baseOnlyResult.triggered) {
    throw new Error('Strategy falsely triggered on baseline history.');
  }
});

runTest('ConsensusEngine - Multi-Strategy Quantitative Consensus Engine', () => {
  // Create 20 baseline candles
  const candles = [];
  const baseTime = Date.now() - 30 * 60000;
  for (let i = 0; i < 20; i++) {
    candles.push({ open: 100, high: 105, low: 95, close: 101, timestamp: baseTime + i * 60000 });
  }

  // Mock ticks
  const ticks = [{ price: 101, timestamp: Date.now() }];

  // Scenario 1: No strategies active -> triggered should be false
  const resEmpty = ConsensusEngine.evaluate(candles, ticks, {});
  if (resEmpty.triggered) {
    throw new Error('Consensus Engine triggered with no active models.');
  }

  // Scenario 2: Liquidity Sweep active but not met -> triggered should be false
  const activeSingle = { 'Liquidity Sweep': true };
  const resSingleNotMet = ConsensusEngine.evaluate(candles, ticks, activeSingle);
  if (resSingleNotMet.triggered) {
    throw new Error('Consensus Engine triggered single inactive model.');
  }

  // Scenario 3: Liquidity Sweep active and perfect sweep conditions met
  const perfectCandles = [];
  for (let i = 0; i < 20; i++) {
    perfectCandles.push({ open: 100, high: 105, low: 95, close: 101, timestamp: baseTime + i * 60000 });
  }
  const lows = [90, 88, 86, 84, 82];
  const ranges = [12, 11, 10, 9, 8];
  for (let i = 0; i < 5; i++) {
    perfectCandles.push({
      open: lows[i] + ranges[i] - 0.5,
      high: lows[i] + ranges[i],
      low: lows[i],
      close: lows[i] + 1,
      timestamp: baseTime + (20 + i) * 60000
    });
  }
  perfectCandles.push({
    open: 116,
    high: 150,
    low: 50,
    close: 146,
    timestamp: Date.now() - 30000
  });

  const perfectTicks = [];
  const tickTime = Date.now() - 30000;
  for (let i = 0; i < 10; i++) {
    perfectTicks.push({ price: i < 3 ? 50 : 140, timestamp: tickTime + (i * 2400) });
  }
  for (let i = 0; i < 10; i++) {
    perfectTicks.push({ price: 141 + (i * i * 0.05) + (i * 0.1), timestamp: tickTime + 24000 + (i * 600) });
  }

  const resPerfect = ConsensusEngine.evaluate(perfectCandles, perfectTicks, { 'Liquidity Sweep': true });
  console.log('resPerfect:', JSON.stringify(resPerfect, null, 2));
  if (!resPerfect.triggered) {
    throw new Error('Consensus Engine failed to trigger when Liquidity Sweep was active and met.');
  }

  if (resPerfect.confidence < 95) {
    throw new Error(`Expected at least 95% confidence, got ${resPerfect.confidence}%`);
  }
});

console.log(`\n=== SCENARIO VERIFICATION COMPLETE (FAILED: ${failed}) ===`);
process.exit(failed > 0 ? 1 : 0);
