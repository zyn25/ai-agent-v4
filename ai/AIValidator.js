import { PromptBuilder } from './PromptBuilder.js';
import { ResponseParser } from './ResponseParser.js';

export class AIValidator {
  #config; #logger; #promptBuilder; #responseParser; #cache = new Map();
  constructor(config, logger) { this.#config = config; this.#logger = logger; this.#promptBuilder = new PromptBuilder(); this.#responseParser = new ResponseParser(); }

  async validate(signal) {
    if (!this.#config.ai.enabled) return { decision: 'approve', confidence: signal.confidence, reason: 'AI disabled' };
    const k = `${signal.side}_${Math.round(signal.confidence/5)*5}`;
    const c = this.#cache.get(k);
    if (c && Date.now() < c.expiry) return c.data;
    try {
      const prompt = this.#promptBuilder.build(signal);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${this.#config.ai.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.#config.ai.model, messages: [{ role: 'user', content: prompt }], max_tokens: this.#config.ai.maxTokens, temperature: this.#config.ai.temperature }) });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      const result = this.#responseParser.parse(data.choices[0].message.content);
      this.#logger.ai(`AI: ${result.decision} | ${result.confidence}%`);
      this.#cache.set(k, { data: result, expiry: Date.now() + 300000 });
      return result;
    } catch (e) { this.#logger.error('AI failed:', e.message); return { decision: 'approve', confidence: signal.confidence, reason: 'AI unavailable', fallback: true }; }
  }
}
