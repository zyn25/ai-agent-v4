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

    // Guard NaN: Pastikan ada angka valid
    const balance = Number(p.balance) || 0;
    const peakBalance = Number(p.peak_balance) || 0;
    const dailyPnl = Number(p.daily_pnl) || 0;
    const weeklyPnl = Number(p.weekly_pnl) || 0;

    // 1. Max drawdown check
    if (peakBalance > 0) {
      const dd = ((peakBalance - balance) / peakBalance) * 100;
      if (dd >= this.#config.risk.maxDrawdown) {
        this.#pause('Max drawdown ' + dd.toFixed(1) + '%');
        return { allowed: false, reason: 'Max drawdown exceeded' };
      }
    }

    // 2. Daily loss check
    if (dailyPnl < 0 && balance > 0) {
      const pct = Math.abs(dailyPnl / balance) * 100;
      if (pct >= this.#config.risk.maxDailyLoss) {
        this.#pause('Daily loss ' + pct.toFixed(1) + '%');
        return { allowed: false, reason: 'Daily loss limit reached' };
      }
    }

    // 3. Weekly loss check
    if (weeklyPnl < 0 && balance > 0) {
      const pct = Math.abs(weeklyPnl / balance) * 100;
      if (pct >= this.#config.risk.maxWeeklyLoss) {
        this.#pause('Weekly loss ' + pct.toFixed(1) + '%');
        return { allowed: false, reason: 'Weekly loss limit reached' };
      }
    }

    // 4. Balance floor check
    const startingBalance = this.#config.trading.startingBalance;
    if (startingBalance > 0 && balance < (startingBalance * 0.5)) {
      this.#pause('Balance below 50% ($' + balance.toFixed(2) + ')');
      return { allowed: false, reason: 'Balance critically low' };
    }

    // 5. Consecutive losses from TODAY only
    const consecutive = this.#getConsecutiveLossesToday();
    if (consecutive >= this.#config.risk.maxConsecutiveLosses) {
      this.#pause('Consecutive losses today (' + consecutive + ')');
      return { allowed: false, reason: 'Max consecutive losses: ' + consecutive };
    }

    return { allowed: true };
  }

  #autoResetDaily() {
    const today = new Date().toISOString().substring(0, 10);
    if (this.#lastResetDate !== today) {
      this.#lastResetDate = today;
      try {
        this.#db.prepare("UPDATE portfolio SET daily_pnl = 0, updated_at = datetime('now', 'utc')").run();
        this.#logger.info('Daily PnL reset');

        if (this.#paused) {
          this.#paused = false;
          this.#reason = '';
          this.#pauseTime = null;
          this.#logger.info('Circuit breaker RESUMED after daily reset');
        }
      } catch (e) {
        this.#logger.error('Daily reset error:', e.message);
      }
    }
  }

  async recordLoss() {
    const consecutive = this.#getConsecutiveLossesToday();
    if (consecutive >= this.#config.risk.maxConsecutiveLosses) {
      this.#pause('Consecutive losses today (' + consecutive + ')');
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

  // FIX: Tambahkan method resetWeekly untuk dipanggil setiap awal minggu
  async resetWeekly() {
    try {
      this.#db.prepare("UPDATE portfolio SET weekly_pnl = 0, updated_at = datetime('now')").run();
      this.#logger.info('Weekly PnL reset');
    } catch (e) {
      this.#logger.error('Weekly reset error:', e.message);
    }
  }

  #getConsecutiveLossesToday() {
    try {
      const trades = this.#db.prepare(
        "SELECT pnl FROM positions WHERE status = 'closed' AND date(close_time, 'utc') = date('now', 'utc') ORDER BY close_time DESC LIMIT 20"
      ).all();
      let count = 0;
      for (const t of trades) {
        if (Number(t.pnl) <= 0) count++;
        else break;
      }
      return count;
    } catch (e) {
      // FIX: Jangan silent fail
      this.#logger.error('Error counting consecutive losses:', e.message);
      return 0;
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
    } catch (e) {
      // FIX: Catat error ke console/logger file agar bisa di-debug
      this.#logger.error('Failed to log pause event to DB:', e.message);
    }
    this.#logger.warn('Circuit breaker PAUSED: ' + reason);
  }

  #shouldResume() {
    if (!this.#pauseTime) return true;
    const pauseDate = new Date(this.#pauseTime).toDateString();
    const today = new Date().toDateString();
    return pauseDate !== today;
  }

  get isPaused() { return this.#paused; }
  get pauseReason() { return this.#reason; }
}
