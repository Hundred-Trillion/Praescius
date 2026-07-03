/**
 * Local Telemetry Manager.
 * Collects, aggregates, and reports anonymous performance diagnostics locally.
 */

class Telemetry {
  constructor() {
    this.wsUptimeTotal = 0;
    this.domUptimeTotal = 0;
    
    this.wsSessionStart = null;
    this.domSessionStart = null;
    
    this.selectorFailures = 0;
    this.providerLatencies = [];
    this.notificationLatencies = [];
    this.replayTicks = 0;
    this.replayTimeMs = 0;
  }

  startWsSession() {
    if (!this.wsSessionStart) {
      this.wsSessionStart = Date.now();
    }
  }

  endWsSession() {
    if (this.wsSessionStart) {
      this.wsUptimeTotal += (Date.now() - this.wsSessionStart);
      this.wsSessionStart = null;
    }
  }

  startDomSession() {
    if (!this.domSessionStart) {
      this.domSessionStart = Date.now();
    }
  }

  endDomSession() {
    if (this.domSessionStart) {
      this.domUptimeTotal += (Date.now() - this.domSessionStart);
      this.domSessionStart = null;
    }
  }

  logSelectorFailure() {
    this.selectorFailures++;
  }

  recordProviderLatency(ms) {
    if (typeof ms === 'number') {
      this.providerLatencies.push(ms);
      if (this.providerLatencies.length > 100) this.providerLatencies.shift();
    }
  }

  recordNotificationLatency(ms) {
    if (typeof ms === 'number') {
      this.notificationLatencies.push(ms);
      if (this.notificationLatencies.length > 50) this.notificationLatencies.shift();
    }
  }

  recordReplay(ticks, durationMs) {
    this.replayTicks += ticks;
    this.replayTimeMs += durationMs;
  }

  /**
   * Compiles current diagnostics summary.
   * @returns {object}
   */
  getSummary() {
    const now = Date.now();
    
    // Add active session uptimes if running
    const activeWsUptime = this.wsSessionStart ? (now - this.wsSessionStart) : 0;
    const activeDomUptime = this.domSessionStart ? (now - this.domSessionStart) : 0;
    
    const wsUptimeMs = this.wsUptimeTotal + activeWsUptime;
    const domUptimeMs = this.domUptimeTotal + activeDomUptime;
    
    const avgProvLat = this.providerLatencies.length > 0 
      ? Number((this.providerLatencies.reduce((a, b) => a + b, 0) / this.providerLatencies.length).toFixed(2)) 
      : 0;
      
    const avgNotifLat = this.notificationLatencies.length > 0 
      ? Number((this.notificationLatencies.reduce((a, b) => a + b, 0) / this.notificationLatencies.length).toFixed(2)) 
      : 0;

    return {
      wsUptimeSeconds: Math.floor(wsUptimeMs / 1000),
      domUptimeSeconds: Math.floor(domUptimeMs / 1000),
      selectorFailures: this.selectorFailures,
      avgProviderLatencyMs: avgProvLat,
      avgNotificationLatencyMs: avgNotifLat,
      replayPerformance: {
        totalSimulatedTicks: this.replayTicks,
        totalExecutionTimeMs: this.replayTimeMs,
        avgTickProcessingTimeMs: this.replayTicks > 0 ? Number((this.replayTimeMs / this.replayTicks).toFixed(3)) : 0
      }
    };
  }
}

export const telemetry = new Telemetry();
export default telemetry;
