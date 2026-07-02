/**
 * Auto strategy switcher.
 * Switches strategy mode based on market conditions and performance.
 */
export class AutoStrategySwitcher {
  #config; #logger; #db; #strategyMode;
  #lastSwitch = 0;
  #switchCooldown = 3600000; // 1 hour minimum between switches

  constructor(config, logger, db, strategyMode) {
    this.#config = config;
    this.#logger = logger;
    this.#db = db;
    this.#strategyMode = strategyMode;
  }

  /**
   * Check if we should switch strategy
   */
  check() {
    // Don't switch too often
    if (Date.now() - this.#lastSwitch < this.#switchCooldown) return;

    const portfolio = this.#db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get();
    if (!portfolio) return;

    const currentMode = this.#strategyMode.getModeName();

    // Switch to conservative if daily loss > 2%
    if (portfolio.daily_pnl < 0 && portfolio.balance > 0) {
      const dailyPct = Math.abs(portfolio.daily_pnl / portfolio.balance) * 100;
      if (dailyPct > 2 && currentMode !== 'conservative') {
        this.#strategyMode.setMode('conservative');
        this.#lastSwitch = Date.now();
        this.#logger.info('Auto-switch: conservative (daily loss ' + dailyPct.toFixed(1) + '%)');
        return;
      }
    }

    // Switch to balanced if in aggressive and loss streak > 3
    const recentTrades = this.#db.prepare(
      "SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 5"
    ).all();

    if (currentMode === 'aggressive' && recentTrades.length >= 3) {
      const last3 = recentTrades.slice(0, 3);
      const allLoss = last3.every(t => t.pnl <= 0);
      if (allLoss) {
        this.#strategyMode.setMode('balanced');
        this.#lastSwitch = Date.now();
        this.#logger.info('Auto-switch: balanced (3 consecutive losses)');
        return;
      }
    }

    // Switch back to aggressive if winning streak > 5 in balanced mode
    if (currentMode === 'balanced' && recentTrades.length >= 5) {
      const last5 = recentTrades.slice(0, 5);
      const allWin = last5.every(t => t.pnl > 0);
      if (allWin) {
        this.#strategyMode.setMode('aggressive');
        this.#lastSwitch = Date.now();
        this.#logger.info('Auto-switch: aggressive (5 consecutive wins)');
        return;
      }
    }
  }
}
