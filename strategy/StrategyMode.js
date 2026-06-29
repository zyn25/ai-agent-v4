export class StrategyMode {
  #currentMode = 'balanced';
  #modes = {
    aggressive: { name: 'Aggressive', confidenceThreshold: 60, maxOpenPositions: 5, riskPerTrade: 1.5, cooldownMinutes: 15 },
    balanced: { name: 'Balanced', confidenceThreshold: 80, maxOpenPositions: 3, riskPerTrade: 1.0, cooldownMinutes: 30 },
    conservative: { name: 'Conservative', confidenceThreshold: 90, maxOpenPositions: 2, riskPerTrade: 0.5, cooldownMinutes: 60 },
    scalping: { name: 'Scalping', confidenceThreshold: 55, maxOpenPositions: 5, riskPerTrade: 0.5, cooldownMinutes: 5 }
  };
  #logger; #db;

  constructor(logger, database) {
    this.#logger = logger;
    this.#db = database;
    // FIX: Load mode from DB, default to 'aggressive' for first run
    try {
      const saved = database.prepare("SELECT value FROM settings WHERE key='strategy_mode'").get();
      if (saved) {
        const mode = JSON.parse(saved.value);
        if (this.#modes[mode]) {
          this.#currentMode = mode;
          this.#logger.info('Strategy mode loaded: ' + mode);
        }
      } else {
        // Default to aggressive for new installations
        this.#currentMode = 'aggressive';
        this.setMode('aggressive');
        this.#logger.info('Strategy mode default: aggressive');
      }
    } catch {
      this.#currentMode = 'aggressive';
      this.#logger.info('Strategy mode fallback: aggressive');
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
      this.#db.prepare("INSERT INTO settings (key,value) VALUES ('strategy_mode',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(mode));
    } catch {}
    this.#logger.info('Strategy mode changed to: ' + mode);
    return true;
  }

  getConfig() {
    const mode = this.#modes[this.#currentMode];
    return { confidenceThreshold: mode.confidenceThreshold, maxOpenPositions: mode.maxOpenPositions, riskPerTrade: mode.riskPerTrade, cooldownMinutes: mode.cooldownMinutes };
  }
}
