/**
 * Strategy mode switcher.
 * Switch between aggressive and conservative modes via Telegram.
 */
export class StrategyMode {
  #currentMode = 'balanced';
  #modes = {
    aggressive: {
      name: 'Aggressive',
      confidenceThreshold: 60,
      maxOpenPositions: 5,
      riskPerTrade: 1.5,
      cooldownMinutes: 15,
      description: 'More trades, higher risk, lower confidence required'
    },
    balanced: {
      name: 'Balanced',
      confidenceThreshold: 80,
      maxOpenPositions: 3,
      riskPerTrade: 1.0,
      cooldownMinutes: 30,
      description: 'Default mode, balanced risk/reward'
    },
    conservative: {
      name: 'Conservative',
      confidenceThreshold: 90,
      maxOpenPositions: 2,
      riskPerTrade: 0.5,
      cooldownMinutes: 60,
      description: 'Fewer trades, lower risk, higher confidence required'
    },
    scalping: {
      name: 'Scalping',
      confidenceThreshold: 55,
      maxOpenPositions: 5,
      riskPerTrade: 0.5,
      cooldownMinutes: 5,
      description: 'Quick trades, small profits, tight stops'
    }
  };

  #logger;
  #db;

  constructor(logger, database) {
    this.#logger = logger;
    this.#db = database;
    // Load saved mode
    try {
      const saved = database.prepare("SELECT value FROM settings WHERE key='strategy_mode'").get();
      if (saved) this.#currentMode = JSON.parse(saved.value);
    } catch {}
  }

  getMode() { return this.#modes[this.#currentMode]; }
  getModeName() { return this.#currentMode; }
  getAllModes() { return this.#modes; }

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
    return {
      confidenceThreshold: mode.confidenceThreshold,
      maxOpenPositions: mode.maxOpenPositions,
      riskPerTrade: mode.riskPerTrade,
      cooldownMinutes: mode.cooldownMinutes
    };
  }
}
