import StrategyRunner from './StrategyRunner.js';
import ConfidenceEngine from './ConfidenceEngine.js';

export default class ConsensusEngine {
  /**
   * Evaluates consensus of all quantitative strategies.
   * @param {object[]} candles
   * @param {object[]} ticks
   * @param {object} activeStrategies - Map of active strategy toggles
   * @returns {object} Consensus evaluation result
   */
  static evaluate(candles, ticks, activeStrategies = {}) {
    const results = StrategyRunner.runAll(candles, ticks);
    const report = ConfidenceEngine.compile(results);

    // Filter triggered strategies that are active in storage
    const triggeredVoters = Object.values(results).filter(r => r.triggered && activeStrategies[r.name]);
    
    let consensusTriggered = false;
    if (triggeredVoters.length > 0) {
      if (triggeredVoters.length >= 2) {
        // High agreement: require reasonable overall confidence
        consensusTriggered = report.confidence >= 80;
      } else {
        // Single model: require extremely high individual and market confidence with no major contradictions
        consensusTriggered = report.confidence >= 90 && report.contradictionDeduction < 30;
      }
    }

    return {
      triggered: consensusTriggered,
      confidence: report.confidence,
      votersCount: triggeredVoters.length,
      allResults: results,
      contradiction: report.contradictionDeduction,
      reasons: report.reasons
    };
  }
}
