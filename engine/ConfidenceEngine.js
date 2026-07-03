export default class ConfidenceEngine {
  /**
   * Compiles the overall market confidence from strategy outputs.
   * @param {object} results - Map of strategy results
   * @returns {object} Confidence report
   */
  static compile(results) {
    let totalWeight = 0;
    let weightedScore = 0;
    let contradictions = 0;

    const activeVoters = [];
    const reasons = [];

    // Count directional voters for contradiction detection
    let bullishCount = 0;
    let bearishCount = 0;

    for (const [name, result] of Object.entries(results)) {
      if (result.score > 30) {
        activeVoters.push(result);
        
        if (result.triggered) {
          if (result.direction === 'bullish') bullishCount++;
          if (result.direction === 'bearish') bearishCount++;
        }

        // Triggered models carry higher voting weight
        const weight = result.triggered ? 3.0 : 0.1;
        totalWeight += weight;
        weightedScore += result.score * weight;
        
        result.reasons.forEach(r => {
          if (!reasons.includes(r)) reasons.push(r);
        });
      }
    }

    // A contradiction occurs if both bullish and bearish signals fire strongly
    if (bullishCount > 0 && bearishCount > 0) {
      contradictions = Math.min(bullishCount, bearishCount) * 20; 
    }

    const baseConfidence = totalWeight > 0 ? (weightedScore / totalWeight) : 0;
    const finalConfidence = Math.max(0, Math.min(100, baseConfidence - contradictions));

    return {
      confidence: Number(finalConfidence.toFixed(1)),
      voters: activeVoters.length,
      contradictionDeduction: contradictions,
      reasons: reasons
    };
  }
}
