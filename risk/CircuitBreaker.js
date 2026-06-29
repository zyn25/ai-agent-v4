/**
 * Circuit breaker for loss limits and trading pauses.
 * FIX: Daily reset based on date change, not exact midnight minute.
 */
export class CircuitBreaker {
  #config; #logger; #db;
  #paused = false; #reason = ''; #pauseTime = null;
  #lastResetDate = null;

  constructor(c, l, db) {
    this.#config = c;
    this.#logger = l;
    this.#db = db;
  }

  async check() {
    this.#autoResetDaily();

    if (this.#paused) {
      if (this.#shouldResume()) {
        this.#paused = false;
        this.#reason = '';
        this.#pauseTime = null;
        this.#logger.info('Circuit breaker RESUMED');
        return { allowed: true };
      }
      return { allowed: false, reason: this.#reason };
    }

    const p = this.#db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get();
    if (!p) return { allowed: true };

    // Max drawdown check
    if (p.peak_balance && p.peak_balance > 0) {
      const dd = ((p.peak_balance - p.balance) / p.peak_balance) * 100;
      if (dd >= this.#config.risk.maxDrawdown) {
        this.#pause('Max drawdown ' + dd.toFixed(1) + '%');
        return { allowed: false, reason: 'Max drawdown exceeded' };
      }
    }

    // Daily loss check
    if (p.daily_pnl < 0 && p.balance > 0) {
      const pct = Math.abs(p.daily_pnl / p.balance) * 100;
      if (pct >= this.#config.risk.maxDailyLoss) {
        this.#pause('Daily loss ' + pct.toFixed(1) + '%');
        return { allowed: false, reason: 'Daily loss limit reached' };
      }
    }

    // Weekly loss check
    if (p.weekly_pnl < 0 && p.balance > 0) {
      const pct = Math.abs(p.weekly_pnl / p.balance) * 100;
      if (pct >= this.#config.risk.maxWeeklyLoss) {
        this.#pause('Weekly loss ' + pct.toFixed(1) + '%');
        return { allowed: false, reason: 'Weekly loss limit reached' };
      }
    }

    // Balance floor check (FIX: stop trading if balance < 50% of starting)
    const startingBalance = this.#config.trading.startingBalance;
    if (p.balance < startingBalance * 0.5) {
      this.#pause('Balance below 50% ($' + p.balance.toFixed(2) + ')');
      return { allowed: false, reason: 'Balance critically low' };
    }

    // Consecutive losses check
    const consecutive = this.#getConsecutiveLosses();
    if (consecutive >= this.#config.risk.maxConsecutiveLosses) {
      this.#pause('Consecutive losses (' + consecutive + ')');
      return { allowed: false, reason: 'Max consecutive losses: ' + consecutive };
    }

    return { allowed: true };
  }

  // FIX: Daily reset based on date change, not exact midnight
  #autoResetDaily() {
    const today = new Date().toDateString();
    if (this.#lastResetDate !== today) {
      this.#lastResetDate = today;
      try {
        this.#db.prepare("UPDATE portfolio SET daily_pnl = 0, updated_at = datetime('now')").run();
        this.#logger.info('Daily PnL reset');

        // Resume if paused for daily loss
        if (this.#paused && this.#reason && this.#reason.includes('Daily')) {
          this.#paused = false;
          this.#reason = '';
          this.#pauseTime = null;
          this.#logger.info('Circuit breaker auto-resumed after daily reset');
        }
      } catch (e) {
        this.#logger.error('Daily reset error:', e.message);
      }
    }
  }

  async recordLoss() {
    const consecutive = this.#getConsecutiveLosses();
    if (consecutive >= this.#config.risk.maxConsecutiveLosses) {
      this.#pause('Consecutive losses (' + consecutive + ')');
    }
  }

  async resetDaily() {
    try {
      this.#db.prepare("UPDATE portfolio SET daily_pnl = 0, updated_at = datetime('now')").run();
      this.#logger.info('Daily PnL reset (manual)');
    } catch (e) {
      this.#logger.error('Manual reset error:', e.message);
    }
  }

  #pause(reason) {
    this.#paused = true;
    this.#reason = reason;
    this.#pauseTime = new Date().toISOString();
    try {
      this.#db.prepare(
        "INSERT INTO system_logs (level, category, message) VALUES (?, ?, ?)"
      ).run('warn', 'circuit_breaker', 'PAUSED: ' + reason);
    } catch {}
    this.#logger.warn('Circuit breaker PAUSED: ' + reason);
  }

  #shouldResume() {
    if (!this.#pauseTime) return true;
    const pauseDate = new Date(this.#pauseTime).toDateString();
    const today = new Date().toDateString();
    return pauseDate !== today;
  }

  #getConsecutiveLosses() {
    try {
      const trades = this.#db.prepare(
        "SELECT pnl FROM positions WHERE status = 'closed' ORDER BY close_time DESC LIMIT 20"
      ).all();
      let count = 0;
      for (const t of trades) {
        if (t.pnl <= 0) count++;
        else break;
      }
      return count;
    } catch {
      return 0;
    }
  }

  get isPaused() { return this.#paused; }
  get pauseReason() { return this.#reason; }
}
