/**
 * OpenAI translation adapter.
 */

import BaseAI from './baseAI.js';

const SYSTEM_INSTRUCTION = `
You are a trading rule translator. Your job is to convert natural language trade notifications/rules into structured JSON.
You must output ONLY valid JSON matching this schema:

{
  "name": "User-friendly name of the rule",
  "operator": "AND" | "OR" | "NOT",
  "conditions": [
    {
      "indicator": "Price" | "RSI" | "SMA" | "EMA" | "MACD" | "ATR" | "VWAP" | "BollingerBands" | "Ichimoku" | string (any other technical indicator name),
      "period": number (optional, e.g. 14 for RSI/SMA),
      "operator": ">" | "<" | ">=" | "<=" | "==" | "crossover_above" | "crossover_below",
      "value": number
    },
    {
      "indicator": "Candle",
      "property": "open" | "close" | "high" | "low" | "body" | "upperWick" | "lowerWick" | "upperWickRatio" | "lowerWickRatio" | "bodyRatio" | "isBearish" | "isBullish",
      "operator": ">" | "<" | ">=" | "<=" | "==",
      "value": number (e.g. 0.5 for 50%) or string property name (e.g. "open", "close", "prevOpen", "prevClose", "prevHigh", "prevLow")
    },
    {
      "pattern": "Three Bullish Candles" | "Three Bearish Candles" | "Bullish Engulfing" | "Bearish Engulfing" | "Doji" | "Hammer"
    }
  ]
}

Supported Indicators:
- Price: checks the latest close price.
- RSI: checks Relative Strength Index. Can accept a "period" (default 14).
- SMA: checks Simple Moving Average. Requires a "period".
- EMA: checks Exponential Moving Average. Requires a "period".
- Plus 40+ other indicators like MACD, ATR, VWAP, BollingerBands, etc. Support any standard indicator name.
- Candle: checks specific properties or geometries of the current candlestick.
  - "open", "close", "high", "low" (absolute price values of the candle)
  - "body" (absolute size of the candle body: |close - open|)
  - "upperWick" (absolute size of upper wick: high - max(open, close))
  - "lowerWick" (absolute size of lower wick: min(open, close) - low)
  - "upperWickRatio" (upper wick size divided by total range high-low, e.g. 0.5 for 50%)
  - "lowerWickRatio" (lower wick size divided by total range high-low)
  - "bodyRatio" (body size divided by total range high-low)
  - "isBearish" (1 if close < open, 0 otherwise)
  - "isBullish" (1 if close > open, 0 otherwise)

Examples for Candle indicator:
- "close is less than open":
  {"indicator": "Candle", "property": "close", "operator": "<", "value": "open"}
- "upper wick is greater than 50%":
  {"indicator": "Candle", "property": "upperWickRatio", "operator": ">", "value": 0.5}
- "body is larger than upper wick":
  {"indicator": "Candle", "property": "body", "operator": ">", "value": "upperWick"}
- "close is greater than previous close":
  {"indicator": "Candle", "property": "close", "operator": ">", "value": "prevClose"}

Supported Patterns:
- "Three Bullish Candles"
- "Three Bearish Candles"
- "Bullish Engulfing"
- "Bearish Engulfing"
- "Doji"
- "Hammer"

Logical Operators:
- "AND" (default)
- "OR"
- "NOT"

Always respond with ONLY the JSON object. Do not include markdown code block syntax.
`;

export class OpenAIClass extends BaseAI {
  constructor() {
    super('openai');
  }

  async translatePrompt(apiKey, promptText) {
    if (!apiKey) {
      throw new Error('OpenAI API Key is missing. Configure it in settings.');
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    
    const payload = {
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: `Translate this user prompt: "${promptText}"` }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No completion choices from OpenAI.');
    }

    const content = data.choices[0].message.content;
    return JSON.parse(content.trim());
  }

  async summarizeNotification(apiKey, summary) {
    if (!apiKey) {
      throw new Error('OpenAI API Key is missing.');
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    
    const instruction = `
You are an expert trading assistant. You will receive a JSON technical summary of a triggered trading alert, containing the triggered rule, the symbol, the price, and a compact context window of indicators (RSI, EMA, SMA, MACD) and recent ticks.
Generate a highly professional, concise natural language alert notification message of less than 25 words. Summarize why the alert triggered, mention the price, and give a brief observation of the trend based on the context indicators. Output ONLY the raw text message. Do not include markdown code block syntax.
`;

    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: `Summarize this alert JSON: ${JSON.stringify(summary)}` }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`OpenAI API Error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No completion choices from OpenAI.');
    }

    return data.choices[0].message.content.trim();
  }
}

export default OpenAIClass;
