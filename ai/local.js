/**
 * Local offline rule translator.
 * Uses regular expressions and string matching to parse rules without external network queries.
 */

import BaseAI from './baseAI.js';

export class LocalAI extends BaseAI {
  constructor() {
    super('local');
  }

  async translatePrompt(apiKey, promptText) {
    const text = String(promptText).toLowerCase();
    
    const rule = {
      name: 'Local Parsed Rule',
      operator: 'AND',
      conditions: []
    };

    // 1. Check patterns
    if (text.includes('three bullish') || text.includes('3 bullish')) {
      rule.conditions.push({ pattern: 'Three Bullish Candles' });
    }
    if (text.includes('three bearish') || text.includes('3 bearish')) {
      rule.conditions.push({ pattern: 'Three Bearish Candles' });
    }
    if (text.includes('bullish engulfing')) {
      rule.conditions.push({ pattern: 'Bullish Engulfing' });
    }
    if (text.includes('bearish engulfing')) {
      rule.conditions.push({ pattern: 'Bearish Engulfing' });
    }
    if (text.includes('doji')) {
      rule.conditions.push({ pattern: 'Doji' });
    }
    if (text.includes('hammer')) {
      rule.conditions.push({ pattern: 'Hammer' });
    }

    // 2. Check numeric indicators (RSI, SMA, EMA, Price)
    // Match "rsi > 70", "rsi exceeds 70", "rsi crosses above 70", etc.
    const rsiMatch = text.match(/rsi\s*(?:exceeds|above|greater than|>|crosses above)?\s*([0-9.]+)/);
    if (rsiMatch) {
      const val = Number(rsiMatch[1]);
      let op = '>';
      if (text.includes('crosses above') || text.includes('crossover above')) {
        op = 'crossover_above';
      } else if (text.includes('below') || text.includes('less than') || text.includes('<')) {
        op = '<';
      }
      rule.conditions.push({
        indicator: 'RSI',
        period: 14,
        operator: op,
        value: val
      });
    }

    // Match price limits: "price crosses above 108000", "price below 95000", "price > 1000"
    const priceMatch = text.match(/(?:price|btc)\s*(?:crosses above|above|greater than|>|<|below|less than)?\s*([0-9.,]+)/);
    if (priceMatch && !text.includes('rsi')) {
      const val = Number(priceMatch[1].replace(/,/g, ''));
      let op = '>';
      if (text.includes('below') || text.includes('less than') || text.includes('<')) {
        op = '<';
      }
      rule.conditions.push({
        indicator: 'Price',
        operator: op,
        value: val
      });
    }

    // Fallback: If no condition is matched, create a dummy warning
    if (rule.conditions.length === 0) {
      throw new Error('Local parser could not extract a rule. Try simpler phrasing like "RSI > 70" or configure a cloud API provider.');
    }

    rule.name = rule.conditions.map(c => c.pattern || `${c.indicator} ${c.operator} ${c.value}`).join(' & ');
    return rule;
  }
}

export default LocalAI;
