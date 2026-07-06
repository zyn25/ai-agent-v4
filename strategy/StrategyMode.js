/**
 * Strategy mode switcher.
 * IMPROVED: Higher minimum confidence for all modes.
 */
export class StrategyMode {
  #currentMode = 'balanced';
  #modes = {
    aggressive: { name: 'Aggressive', confidenceThreshold: 40, maxOpenPositions: 5, riskPerTrade: 1.0, cooldownMinutes: 15 },
    balanced: { name: 'Balanced', confidenceThreshold: 55, maxOpenPositions: 3, riskPerTrade: 0.75, cooldownMinutes: 30 },
    conservative: { name: 'Conservative', confidenceThreshold: 70, maxOpenPositions: 2, riskPerTrade: 0.5, cooldownMinutes: 60 },
    scalping: { name: 'Scalping', confidenceThreshold: 35, maxOpenPositions: 5, riskPerTrade: 0.5, cooldownMinutes: 5 }
  };
  #logger; #db; #loaded = false;

  constructor(logger, database) {
    this.#logger = logger;
    this.#db = database;
  }

  loadFromDatabase() {
    if (this.#loaded) return;
    this.#loaded = true;
    try {
      const saved = this.#db.prepare("SELECT value FROM settings WHERE key='strategy_mode'").get();
      if (saved) {
        const mode = JSON.parse(saved.value);
        if (this.#modes[mode]) {
          this.#currentMode = mode;
          this.#logger.info('Strategy mode loaded: ' + mode);
          return;
        }
      }
      this.setMode('balanced');
      this.#logger.info('Strategy mode default: balanced');
    } catch (e) {
      this.#logger.warn('Could not load mode, using default: ' + e.message);
      this.#currentMode = 'balanced';
    }
  }

  getMode() { return this.#modes[this.#currentMode]; }
  getModeName() { return this.#currentMode; }
  getAllModes() { return this.#modes; }
  getConfidenceThreshold() { return this.#modes[this.#currentMode].confidenceThreshold; }
  getCooldownMinutes() { return this.#modes[this.#currentMode].cooldownMinutes; }
  getMaxOpenPositions() { return this.#modes[this.#currentMode].maxOpenPositions; }

  setMode(mode) {
    if (!this.#modes[mode]) return false;
    this.#currentMode = mode;
    try {
      this.#db.prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
      ).run('strategy_mode', JSON.stringify(mode));
      this.#logger.info('Strategy mode changed to: ' + mode);
    } catch (e) {
      this.#logger.error('Failed to save mode: ' + e.message);
    }
    return true;
  }
}
