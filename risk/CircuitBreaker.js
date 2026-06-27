export class CircuitBreaker {
  #config; #logger; #database; #paused = false; #reason = ''; #pauseTime = null;

  constructor(config, logger, db) {
    this.#config = config; this.#logger = logger; this.#database = db;
  }

  async check() {
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

    const p = this.#database.db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get();
    if (!p) return { allowed: true };

    // Max drawdown check
    if (p.equity && p.equity > 0) {
      const dd = Math.abs((p.balance - p.equity) / p.balance) * 100;
      if (dd >= this.#config.risk.maxDrawdown) {
        this.#pause('Max drawdown exceeded');
        return { allowed: false, reason: 'Max drawdown exceeded' };
      }
    }

    // Daily loss check
    if (p.daily_pnl < 0 && p.balance > 0) {
      const dailyPct = Math.abs(p.daily_pnl / p.balance) * 100;
      if (dailyPct >= this.#config.risk.maxDailyLoss) {
        this.#pause('Daily loss limit reached');
        return { allowed: false, reason: 'Daily loss limit reached' };
      }
    }

    // Weekly loss check
    if (p.weekly_pnl < 0 && p.balance > 0) {
      const weeklyPct = Math.abs(p.weekly_pnl / p.balance) * 100;
      if (weeklyPct >= this.#config.risk.maxWeeklyLoss) {
        this.#pause('Weekly loss limit reached');
        return { allowed: false, reason: 'Weekly loss limit reached' };
      }
    }

    // Consecutive losses check
    const consecutive = this.#getConsecutiveLosses();
    if (consecutive >= this.#config.risk.maxConsecutiveLosses) {
      this.#pause(`Max consecutive losses (${consecutive})`);
      return { allowed: false, reason: `Max consecutive losses: ${consecutive}` };
    }

    return { allowed: true };
  }

  async recordLoss() {
    const consecutive = this.#getConsecutiveLosses();
    if (consecutive >= this.#config.risk.maxConsecutiveLosses) {
      this.#pause(`Max consecutive losses (${consecutive})`);
    }
  }

  async resetDaily() {
    this.#database.db.prepare("UPDATE portfolio SET daily_pnl=0,updated_at=datetime('now')").run();
    this.#logger.info('Daily PnL reset');
  }

  #pause(reason) {
    this.#paused = true;
    this.#reason = reason;
    this.#pauseTime = new Date().toISOString();
    // FIX: Write to database so shouldResume() can find it
    this.#database.db.prepare(
      "INSERT INTO system_logs (level,category,message) VALUES ('warn','circuit_breaker',?)"
    ).run(`Circuit breaker PAUSED: ${reason}`);
    this.#logger.warn(`Circuit breaker PAUSED: ${reason}`);
  }

  #shouldResume() {
    // FIX: Check in-memory pause time instead of querying system_logs
    if (!this.#pauseTime) return true;
    const pauseDate = new Date(this.#pauseTime);
    const now = new Date();
    // Resume next day
    return now.toDateString() !== pauseDate.toDateString();
  }

  #getConsecutiveLosses() {
    const trades = this.#database.db.prepare(
      "SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 20"
    ).all();
    let count = 0;
    for (const t of trades) { if (t.pnl <= 0) count++; else break; }
    return count;
  }

  get isPaused() { return this.#paused; }
  get pauseReason() { return this.#reason; }
}
