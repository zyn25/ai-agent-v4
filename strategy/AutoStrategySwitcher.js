/**
 * Auto strategy switcher.
 * Switches strategy mode based on market conditions and performance.
 */
export class AutoStrategySwitcher {
  #config; #logger; #db; #strategyMode;
  #lastSwitch = 0;
  #switchCooldown;
  #consecutiveLossToSwitch;
  #consecutiveWinToSwitch;
  #dailyLossThresholdPct;
  #dailyRecoveryThresholdPct;

  constructor(config, logger, db, strategyMode) {
    this.#config = config;
    this.#logger = logger;
    this.#db = db;
    this.#strategyMode = strategyMode;

    // Konfigurasi dari config, fallback ke default
    this.#switchCooldown = config.switchCooldownMs ?? 3600000;       // 1 jam
    this.#consecutiveLossToSwitch = config.consecutiveLossToSwitch ?? 3;
    this.#consecutiveWinToSwitch = config.consecutiveWinToSwitch ?? 5;
    this.#dailyLossThresholdPct = config.dailyLossThresholdPct ?? 2;  // 2%
    this.#dailyRecoveryThresholdPct = config.dailyRecoveryThresholdPct ?? 1; // 1% profit untuk keluar conservative
  }

  /**
   * Check if we should switch strategy.
   * @returns {{ switched: boolean, from: string, to: string, reason: string } | null}
   */
  check() {
    // Jangan switch terlalu sering
    if (Date.now() - this.#lastSwitch < this.#switchCooldown) return null;

    // Ambil data portfolio dengan error handling
    let portfolio;
    try {
      portfolio = this.#db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get();
    } catch (e) {
      this.#logger.warn('AutoStrategySwitcher: Gagal membaca portfolio: ' + e.message);
      return null;
    }

    if (!portfolio || portfolio.balance == null) return null;

    const currentMode = this.#strategyMode.getModeName();

    // Ambil riwayat trade terbaru
    let recentTrades;
    try {
      recentTrades = this.#db.prepare(
        "SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 10"
      ).all();
    } catch (e) {
      this.#logger.warn('AutoStrategySwitcher: Gagal membaca posisi: ' + e.message);
      recentTrades = [];
    }

    // --- Cek 1: Conservative jika daily loss > threshold ---
    if (portfolio.daily_pnl != null && portfolio.daily_pnl < 0 && portfolio.balance > 0) {
      const dailyPct = Math.abs(portfolio.daily_pnl / portfolio.balance) * 100;
      if (dailyPct > this.#dailyLossThresholdPct && currentMode !== 'conservative') {
        return this.#doSwitch(currentMode, 'conservative',
          'Daily loss ' + dailyPct.toFixed(1) + '% > ' + this.#dailyLossThresholdPct + '%');
      }
    }

    // --- Cek 2: Keluar dari conservative jika daily profit > recovery threshold ---
    if (currentMode === 'conservative' && portfolio.daily_pnl != null && portfolio.daily_pnl > 0 && portfolio.balance > 0) {
      const dailyPct = (portfolio.daily_pnl / portfolio.balance) * 100;
      if (dailyPct > this.#dailyRecoveryThresholdPct) {
        return this.#doSwitch(currentMode, 'balanced',
          'Daily profit ' + dailyPct.toFixed(1) + '% > ' + this.#dailyRecoveryThresholdPct + '% (pemulihan)');
      }
    }

    // --- Cek 3: Aggressive → Balanced jika loss streak ---
    if (currentMode === 'aggressive' && recentTrades.length >= this.#consecutiveLossToSwitch) {
      const lastN = recentTrades.slice(0, this.#consecutiveLossToSwitch);
      const allLoss = lastN.every(t => t.pnl != null && t.pnl <= 0);
      if (allLoss) {
        return this.#doSwitch(currentMode, 'balanced',
          this.#consecutiveLossToSwitch + ' loss berturut-turut');
      }
    }

    // --- Cek 4: Balanced → Aggressive jika win streak ---
    if (currentMode === 'balanced' && recentTrades.length >= this.#consecutiveWinToSwitch) {
      const lastN = recentTrades.slice(0, this.#consecutiveWinToSwitch);
      const allWin = lastN.every(t => t.pnl != null && t.pnl > 0);
      if (allWin) {
        return this.#doSwitch(currentMode, 'aggressive',
          this.#consecutiveWinToSwitch + ' win berturut-turut');
      }
    }

    return null;
  }

  /**
   * Execute switch and return result.
   */
  #doSwitch(from, to, reason) {
    this.#strategyMode.setMode(to);
    this.#lastSwitch = Date.now();
    this.#logger.info('Auto-switch: ' + from + ' → ' + to + ' (' + reason + ')');
    return { switched: true, from, to, reason };
  }
}
