/**
 * Strategy mode switcher.
 * FIX: Lower thresholds to match realistic scoring.
 * FIX: Better persistence to database.
 */
export class StrategyMode {
  #currentMode = 'balanced';
  #modes = {
    aggressive: { name: 'Aggressive', confidenceThreshold: 25, maxOpenPositions: 5, riskPerTrade: 1.5, cooldownMinutes: 15 },
    balanced: { name: 'Balanced', confidenceThreshold: 35, maxOpenPositions: 3, riskPerTrade: 1.0, cooldownMinutes: 30 },
    conservative: { name: 'Conservative', confidenceThreshold: 50, maxOpenPositions: 2, riskPerTrade: 0.5, cooldownMinutes: 60 },
    scalping: { name: 'Scalping', confidenceThreshold: 15, maxOpenPositions: 5, riskPerTrade: 0.5, cooldownMinutes: 5 }
  };
  #logger; #db;

  constructor(logger, database) {
    this.#logger = logger;
    this.#db = database;
    this.#loadMode();
  }

  #loadMode() {
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
    } catch (e) {
      this.#logger.warn('Could not load strategy mode:', e.message);
    }
    // Default
    this.#currentMode = 'aggressive';
    this.setMode('aggressive');
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
      // FIX: Ensure table exists before insert
      this.#db.exec(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);
      this.#db.prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
      ).run('strategy_mode', JSON.stringify(mode));
      this.#logger.info('Strategy mode changed to: ' + mode);
    } catch (e) {
      this.#logger.error('Failed to save mode:', e.message);
    }
    return true;
  }

  getConfig() {
    const mode = this.#modes[this.#currentMode];
    return {
      confidenceThreshold: mode.confidenceThreshold,
      maxOpenPositions: mode.maxOpenPositions,
      riskPerTrade: mode.riskPerTrade,
      cooldownMinutes: mode.cooldownMinutes
    };
  }
}
