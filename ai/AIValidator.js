import { PromptBuilder } from './PromptBuilder.js';
import { ResponseParser } from './ResponseParser.js';

export class AIValidator {
  #config; #logger; #promptBuilder; #responseParser;
  #cache; #cacheTTL; #failCount; #maxFails;

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

  async validate(signal, strategyThreshold) {
    if (!this.#config.ai.enabled) {
      // FIX: Use strategy threshold, not AI config threshold
      return this.#indicatorOnly(signal, strategyThreshold);
    }

    const cacheKey = this.#getCacheKey(signal);
    const cached = this.#getFromCache(cacheKey);
    if (cached) return cached;

    // FIX: After max failures, reject instead of approve
    if (this.#failCount >= this.#maxFails) {
      this.#logger.warn('AI unavailable (' + this.#failCount + ' fails). Using REJECT mode.');
      return {
        decision: 'reject',
        confidence: signal.confidence,
        reason: 'AI unavailable - REJECT for safety',
        fallback: true,
      };
    }

    try {
      const prompt = this.#promptBuilder.build(signal);
      const startTime = Date.now();
      const response = await this.#callAPI(prompt);
      const latency = Date.now() - startTime;

      const result = this.#responseParser.parse(response);
      this.#failCount = 0;

      this.#logger.ai(
        'AI: ' + result.decision + ' | ' + result.confidence + '% | ' + result.reason + ' | ' + latency + 'ms'
      );

      this.#setCache(cacheKey, result);
      return result;
    } catch (error) {
      this.#failCount++;
      this.#logger.error('AI failed (' + this.#failCount + '/' + this.#maxFails + '): ' + error.message);

      // FIX: After max failures, REJECT
      if (this.#failCount >= this.#maxFails) {
        return {
          decision: 'reject',
          confidence: signal.confidence,
          reason: 'AI unavailable - REJECT for safety',
          fallback: true,
        };
      }

      // FIX: First failures = REJECT (not approve)
      return {
        decision: 'reject',
        confidence: 0,
        reason: 'AI error: ' + error.message,
        fallback: true,
      };
    }
  }

  // FIX: Use strategy threshold, not AI config threshold
  #indicatorOnly(signal, strategyThreshold) {
    const threshold = strategyThreshold || this.#config.ai.confidenceThreshold || 70;
    const approved = signal.confidence >= threshold;

    return {
      decision: approved ? 'approve' : 'reject',
      confidence: signal.confidence,
      reason: approved
        ? 'Indicator-only: ' + signal.confidence + '% >= ' + threshold + '%'
        : 'Indicator-only: ' + signal.confidence + '% < ' + threshold + '%',
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
