export class ResponseParser {
  parse(response) {
    try {
      if (typeof response !== 'string') {
        return this.#fallback(response);
      }

      const json = this.#extractJSON(response);
      if (!json) return this.#fallback(response);

      return {
        decision: this.#validateDecision(json.decision),
        confidence: this.#clamp(json.confidence, 0, 100),
        reason: json.reason || 'No reason provided',
        riskLevel: this.#validateField(json.riskLevel, ['low','medium','high'], 'medium'),
        trendStrength: this.#validateField(json.trendStrength, ['weak','moderate','strong'], 'moderate'),
        momentum: this.#validateField(json.momentum, ['bullish','bearish','neutral'], 'neutral'),
        volumeAnalysis: this.#validateField(json.volumeAnalysis, ['supportive','neutral','concerning'], 'neutral'),
        marketCondition: this.#validateField(json.marketCondition, ['trending','ranging','volatile'], 'unknown'),
      };
    } catch (error) {
      return this.#fallback(response);
    }
  }

  #extractJSON(text) {
    const match = text.match(/\{[\s\S]*?\}(?=\s|$|\.)|(?<=\s|\.)\{[\s\S]*\}/);
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);

    let targetJson = null;
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      targetJson = jsonBlockMatch[1].match(/\{[\s\S]*\}/)?.[0];
    } else if (match) {
      targetJson = match[0];
    }

    if (!targetJson) return null;
    return JSON.parse(targetJson);
  }

  #validateDecision(d) {
    return ['approve','reject','wait'].includes(d) ? d : 'reject';
  }

  #validateField(v, valid, def) {
    return valid.includes(v) ? v : def;
  }

  #clamp(v, min, max) {
    const num = typeof v === 'number' ? v : parseFloat(v);
    const safeNum = isNaN(num) ? 0 : Math.round(num);
    return Math.min(Math.max(safeNum, min), max);
  }

  #fallback(response) {
    const l = (response?.toString() || '').toLowerCase();
    let d = 'reject';

    if (l.includes('approve') || l.includes('good') || l.includes('buy') || l.includes('long')) {
      d = 'approve';
    } else if (l.includes('wait') || l.includes('hold') || l.includes('sideways')) {
      d = 'wait';
    }

    return {
      decision: d,
      confidence: 50,
      reason: 'Fallback parse (JSON failed or invalid)',
      riskLevel: 'medium',
      trendStrength: 'moderate',
      momentum: 'neutral',
      volumeAnalysis: 'neutral',
      marketCondition: 'unknown'
    };
  }
}
