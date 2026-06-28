/**
 * Multi-AI model support.
 * Required by master prompt: "Support Multiple AI Models"
 */
export class AIModelManager {
  #models;
  #currentModel;
  #logger;
  #failures = new Map();

  constructor(config, logger) {
    this.#logger = logger;
    this.#models = [
      {
        name: config.ai.model || 'openai/gpt-4o',
        apiKey: config.ai.apiKey,
        maxTokens: config.ai.maxTokens,
        temperature: config.ai.temperature,
        priority: 1
      },
      // Fallback models
      { name: 'anthropic/claude-3.5-sonnet', priority: 2 },
      { name: 'google/gemini-pro', priority: 3 },
      { name: 'meta-llama/llama-3.1-70b-instruct', priority: 4 }
    ];
    this.#currentModel = this.#models[0];
  }

  async call(prompt) {
    const models = this.#models
      .filter(m => m.apiKey || m === this.#models[0])
      .sort((a, b) => a.priority - b.priority);

    for (const model of models) {
      const failures = this.#failures.get(model.name) || 0;
      if (failures >= 3) {
        this.#logger.warn('AI model ' + model.name + ' skipped (too many failures)');
        continue;
      }

      try {
        const result = await this.#callModel(model, prompt);
        this.#failures.set(model.name, 0);
        return result;
      } catch (error) {
        this.#failures.set(model.name, failures + 1);
        this.#logger.warn('AI model ' + model.name + ' failed: ' + error.message);
      }
    }

    throw new Error('All AI models failed');
  }

  async #callModel(model, prompt) {
    const apiKey = model.apiKey || this.#models[0].apiKey;
    if (!apiKey) throw new Error('No API key for ' + model.name);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-agent-v4.local',
        'X-Title': 'AI Agent V4'
      },
      body: JSON.stringify({
        model: model.name,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: model.maxTokens || 500,
        temperature: model.temperature || 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('API error ' + response.status + ': ' + errorText);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model: model.name,
      usage: data.usage
    };
  }

  getCurrentModel() { return this.#currentModel; }
  getModels() { return this.#models; }

  getFailures() {
    const result = {};
    for (const [name, count] of this.#failures) {
      result[name] = count;
    }
    return result;
  }
}
