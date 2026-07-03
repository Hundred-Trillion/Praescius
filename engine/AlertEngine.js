export default class AlertEngine {
  constructor(showNotificationCallback, eventBusPublishCallback) {
    this.showNotification = showNotificationCallback;
    this.publishEvent = eventBusPublishCallback;
    this.cooldowns = {};
  }

  /**
   * Evaluates and handles alerts for a tab/symbol.
   * @param {string} tabId
   * @param {string} symbol
   * @param {string} timeframe
   * @param {object} consensusResult
   * @param {object} settings
   */
  process(tabId, symbol, timeframe, consensusResult, settings) {
    if (settings.notificationsEnabled === false) return;
    if (!consensusResult.triggered) return;

    const now = Date.now();
    const cooldownKey = `${tabId}_consensus_${symbol}`;
    
    // Find the maximum cooldown among the triggered strategies
    let maxCooldownSeconds = 120;
    const triggeredNames = [];
    
    Object.values(consensusResult.allResults).forEach(res => {
      if (res.triggered) {
        triggeredNames.push(res.name);
        if (res.cooldown > maxCooldownSeconds) {
          maxCooldownSeconds = res.cooldown;
        }
      }
    });

    const cooldownMs = maxCooldownSeconds * 1000;
    if (this.cooldowns[cooldownKey] && (now - this.cooldowns[cooldownKey] < cooldownMs)) {
      return;
    }

    // Set cooldown
    this.cooldowns[cooldownKey] = now;

    // Disptach Chrome desktop notification
    const title = `${symbol} [Consensus Trigger]`;
    const body = `Models Agreed: ${triggeredNames.join(', ')}\nMarket Confidence: ${consensusResult.confidence}%\nReasons: ${consensusResult.reasons.slice(0, 3).join(', ')}`;
    
    this.showNotification(title, body);

    // Publish event for UI telemetry/listeners
    this.publishEvent('market.consensus.trigger.v1', {
      symbol,
      timeframe,
      tabId,
      confidence: consensusResult.confidence,
      triggeredStrategies: triggeredNames,
      contradiction: consensusResult.contradiction,
      reasons: consensusResult.reasons,
      allResults: consensusResult.allResults,
      timestamp: now
    });

    this.publishEvent('system.logs.v1', {
      message: `Consensus Reached: Models Agreed: ${triggeredNames.join(', ')} (Confidence: ${consensusResult.confidence}%)`,
      type: 'info',
      tabId,
      provider: 'consensus_engine'
    });
  }
}
