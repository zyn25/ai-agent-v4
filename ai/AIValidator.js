import { PromptBuilder } from './PromptBuilder.js';
import { ResponseParser } from './ResponseParser.js';

/**
 * AI signal validator.
 * Returns: Approve/Reject/Wait with all required fields.
 * CRITICAL FIX: Fallback to REJECT when AI unavailable (not approve).
 * Master prompt: "Fallback to indicator-only mode" = higher threshold, not skip filter.
 */
export class AIValidator {
  #config; #logger; #promptBuilder; #responseParser; #cache; #cacheTTL; #failCount; #maxFails;

  constructor(config, logger) {
    this.#config = config;
    this.#logger = logger;
    this.#promptBuilder = new PromptBuilder();
    this.#responseParser = new ResponseParser();
    this.#cache = new Map();
    this.#cacheTTL = 300000;
    this.#failCount = 0;
    this.#maxFails = 3;
  }

  async validate(signal) {
    if (!this.#config.ai.enabled) {
      return this.#indicatorOnly(signal);
    }

    const cacheKey = this.#getCacheKey(signal);
    const cached = this.#getFromCache(cacheKey);
    if (cached) return cached;

    // FIX: If too many consecutive failures, reject instead of approve
    if (this.#failCount >= this.#maxFails) {
      this.#logger.warn('AI unavailable (' + this.#failCount + ' failures). Using indicator-only mode.');
      return this.#indicatorOnly(signal);
    }

    try {
      const prompt = this.#promptBuilder.build(signal);
      const startTime = Date.now();
      const response = await this.#callAPI(prompt);
      const latency = Date.now() - startTime;

      const result = this.#responseParser.parse(response);
      this.#failCount = 0; // Reset on success

      this.#logger.ai(
        'AI: ' + result.decision + ' | ' + result.confidence + '% | ' + result.reason + ' | ' + latency + 'ms'
      );

      this.#setCache(cacheKey, result);
      return result;
    } catch (error) {
      this.#failCount++;
      this.#logger.error('AI failed (' + this.#failCount + '/' + this.#maxFails + '): ' + error.message);

      // FIX: After max failures, use indicator-only mode (reject low confidence)
      if (this.#failCount >= this.#maxFails) {
        this.#logger.warn('AI circuit breaker triggered. Using indicator-only mode.');
        return this.#indicatorOnly(signal);
      }

      // For first failures, still try to proceed but with reduced confidence
      return {
        decision: 'reject',
        confidence: 0,
        reason: 'AI error: ' + error.message,
        fallback: true,
      };
    }
  }

  /**
   * Indicator-only mode: require higher confidence when AI is unavailable.
   * Master prompt: "Fallback to indicator-only mode if AI unavailable"
   */
  #indicatorOnly(signal) {
    const threshold = this.#config.ai.confidenceThreshold || 70;
    const approved = signal.confidence >= threshold;

    return {
      decision: approved ? 'approve' : 'reject',
      confidence: signal.confidence,
      reason: approved
        ? 'Indicator-only: ' + signal.confidence + '% >= ' + threshold + '%'
        : 'Indicator-only: ' + signal.confidence + '% < ' + threshold + '% (need ' + threshold + '%)',
      riskLevel: signal.confidence >= 80 ? 'low' : signal.confidence >= 60 ? 'medium' : 'high',
      trendStrength: signal.confidence >= 80 ? 'strong' : signal.confidence >= 60 ? 'moderate' : 'weak',
      momentum: signal.side === 'long' ? 'bullish' : 'bearish',
      volumeAnalysis: 'neutral',
      marketCondition: 'unknown',
      fallback: true,
    };
  }

  async #callAPI(prompt) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + this.#config.ai.apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ai-agent-v4.local',
        },
        body: JSON.stringify({
          model: this.#config.ai.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: this.#config.ai.maxTokens,
          temperature: this.#config.ai.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('API error: ' + response.status);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timeout);
    }
  }

  #getCacheKey(signal) {
    return signal.side + '_' + Math.round(signal.confidence / 5) * 5;
  }

  #getFromCache(key) {
    const entry = this.#cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) { this.#cache.delete(key); return null; }
    return entry.data;
  }

  #setCache(key, data) {
    this.#cache.set(key, { data, expiry: Date.now() + this.#cacheTTL });
  }
}
