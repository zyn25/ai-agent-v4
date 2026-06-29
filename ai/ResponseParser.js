/**
 * Parses AI response into structured result.
 * Handles all fields required by master prompt.
 */
export class ResponseParser {
  parse(response) {
    try {
      const json = this.#extractJSON(response);
      if (!json) return this.#fallback(response);
      return {
        decision: this.#validateDecision(json.decision),
        confidence: this.#clamp(json.confidence, 0, 100),
        reason: json.reason || 'No reason provided',
        riskLevel: this.#validateRiskLevel(json.riskLevel),
        trendStrength: this.#validateTrendStrength(json.trendStrength),
        momentum: this.#validateMomentum(json.momentum),
        volumeAnalysis: this.#validateVolumeAnalysis(json.volumeAnalysis),
        marketCondition: this.#validateMarketCondition(json.marketCondition),
      };
    } catch { return this.#fallback(response); }
  }

  #extractJSON(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  }

  #validateDecision(d) { return ['approve','reject','wait'].includes(d) ? d : 'reject'; }
  #validateRiskLevel(r) { return ['low','medium','high'].includes(r) ? r : 'medium'; }
  #validateTrendStrength(t) { return ['weak','moderate','strong'].includes(t) ? t : 'moderate'; }
  #validateMomentum(m) { return ['bullish','bearish','neutral'].includes(m) ? m : 'neutral'; }
  #validateVolumeAnalysis(v) { return ['supportive','neutral','concerning'].includes(v) ? v : 'neutral'; }
  #validateMarketCondition(c) { return ['trending','ranging','volatile'].includes(c) ? c : 'unknown'; }
  #clamp(v, min, max) { return Math.min(Math.max(parseInt(v, 10) || 0, min), max); }

  #fallback(response) {
    const l = response.toLowerCase();
    let d = 'reject';
    if (l.includes('approve') || l.includes('good')) d = 'approve';
    else if (l.includes('wait') || l.includes('hold')) d = 'wait';
    return {
      decision: d, confidence: 50, reason: 'Fallback parse',
      riskLevel: 'medium', trendStrength: 'moderate',
      momentum: 'neutral', volumeAnalysis: 'neutral', marketCondition: 'unknown',
    };
  }
}
