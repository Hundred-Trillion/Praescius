/**
 * Replay Engine.
 * Supports offline simulation and deterministic testing without connecting to live brokers.
 */

import { eventBus } from './eventBus.js';
import { telemetry } from './telemetry.js';

export class ReplayEngine {
  constructor() {
    this.candles = [];
    this.currentIndex = 0;
    this.intervalId = null;
    this.isPlaying = false;
    this.speedMs = 1000;
  }

  /**
   * Load JSONL content string into simulation cache.
   * @param {string} jsonlString 
   */
  loadCandles(jsonlString) {
    if (!jsonlString) return;

    this.candles = jsonlString
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        try {
          const raw = JSON.parse(line);
          return {
            schema: raw.schema || 1,
            provider: raw.provider || 'replay',
            symbol: raw.symbol || 'BTC/USD',
            timeframe: raw.tf || '1m',
            timestamp: raw.t ? (raw.t * 1000) : Date.now(), // seconds to ms
            open: Number(raw.o),
            high: Number(raw.h),
            low: Number(raw.l),
            close: Number(raw.c),
            price: Number(raw.c),
            volume: Number(raw.v || 0),
            source: 'replay_engine'
          };
        } catch (e) {
          return null;
        }
      })
      .filter(c => c !== null);

    this.currentIndex = 0;
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    eventBus.publish('system.logs.v1', {
      message: `Replay engine loaded ${this.candles.length} simulation records.`,
      type: 'info'
    });
  }

  /**
   * Starts simulation player.
   */
  start(speed = 1000) {
    if (this.isPlaying || this.candles.length === 0) return;
    this.isPlaying = true;
    this.speedMs = speed;
    
    this.intervalId = setInterval(() => {
      this.step();
    }, this.speedMs);

    eventBus.publish('system.logs.v1', { message: 'Replay simulation started.', type: 'info' });
  }

  /**
   * Pauses simulation.
   */
  pause() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    eventBus.publish('system.logs.v1', { message: 'Replay simulation paused.', type: 'info' });
  }

  /**
   * Stops simulation and resets pointers.
   */
  stop() {
    this.pause();
    this.currentIndex = 0;
    eventBus.publish('system.logs.v1', { message: 'Replay simulation stopped.', type: 'info' });
  }

  /**
   * Emits a single step candle on the Event Bus.
   */
  step() {
    if (this.currentIndex >= this.candles.length) {
      this.stop();
      eventBus.publish('system.logs.v1', { message: 'Replay simulation completed.', type: 'info' });
      return;
    }

    const tStart = performance.now();
    const candle = this.candles[this.currentIndex];
    this.currentIndex++;

    // Publish parsed candle event
    eventBus.publish('market.candle.v1', candle);
    
    const tEnd = performance.now();
    telemetry.recordReplay(1, tEnd - tStart);
  }
}

export const replayEngine = new ReplayEngine();
export default replayEngine;
