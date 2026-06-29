export class ReportService {
  #config; #logger; #db; #telegram; #intervals;
  #lastDaily; #lastWeekly; #lastMonthly;

  constructor(config, logger, db, tg) {
    this.#config = config;
    this.#logger = logger;
    this.#db = db;
    this.#telegram = tg;
    this.#intervals = [];
    this.#lastDaily = null;
    this.#lastWeekly = null;
    this.#lastMonthly = null;
  }

  start() {
    this.#intervals.push(setInterval(() => {
      const n = new Date();
      const today = n.toDateString();

      // Daily at midnight
      if (n.getHours() === 0 && n.getMinutes() === 0) {
        if (this.#lastDaily !== today) {
          this.#lastDaily = today;
          this.#daily();
        }
      }

      // Weekly on Sunday at midnight
      if (n.getDay() === 0 && n.getHours() === 0 && n.getMinutes() === 0) {
        if (this.#lastWeekly !== today) {
          this.#lastWeekly = today;
          this.#weekly();
        }
      }

      // Monthly on 1st at midnight
      if (n.getDate() === 1 && n.getHours() === 0 && n.getMinutes() === 0) {
        if (this.#lastMonthly !== today) {
          this.#lastMonthly = today;
          this.#monthly();
        }
      }
    }, 60000));
    this.#logger.info('Report service started (daily + weekly + monthly)');
  }

  async #daily() {
    try {
      const r = this.#getStats(1);
      const t = this.#ts();
      await this.#telegram.sendReport(
        '📊 <b>DAILY REPORT</b>\n\n' +
        'Trades: ' + r.total + '\n' +
        'Wins: ' + r.wins + ' | Losses: ' + r.losses + '\n' +
        'Win Rate: ' + r.winRate + '%\n' +
        'PnL: $' + r.totalPnl.toFixed(2) + '\n' +
        'Best: $' + r.best.toFixed(2) + '\n' +
        'Worst: $' + r.worst.toFixed(2) + '\n\n' +
        '🕐 ' + t
      );
    } catch (e) { this.#logger.error('Daily report:', e.message); }
  }

  async #weekly() {
    try {
      const r = this.#getStats(7);
      const t = this.#ts();
      await this.#telegram.sendReport(
        '📊 <b>WEEKLY REPORT</b>\n\n' +
        'Trades: ' + r.total + '\n' +
        'Wins: ' + r.wins + ' | Losses: ' + r.losses + '\n' +
        'Win Rate: ' + r.winRate + '%\n' +
        'PnL: $' + r.totalPnl.toFixed(2) + '\n' +
        'Avg: $' + r.avgPnl.toFixed(2) + '\n\n' +
        '🕐 ' + t
      );
    } catch (e) { this.#logger.error('Weekly report:', e.message); }
  }

  async #monthly() {
    try {
      const r = this.#getStats(30);
      const t = this.#ts();
      await this.#telegram.sendReport(
        '📊 <b>MONTHLY REPORT</b>\n\n' +
        'Trades: ' + r.total + '\n' +
        'Wins: ' + r.wins + ' | Losses: ' + r.losses + '\n' +
        'Win Rate: ' + r.winRate + '%\n' +
        'PnL: $' + r.totalPnl.toFixed(2) + '\n' +
        'Best: $' + r.best.toFixed(2) + '\n' +
        'Worst: $' + r.worst.toFixed(2) + '\n' +
        'Avg: $' + r.avgPnl.toFixed(2) + '\n\n' +
        '🕐 ' + t
      );
    } catch (e) { this.#logger.error('Monthly report:', e.message); }
  }

  #getStats(days) {
    const rows = this.#db.prepare(
      "SELECT * FROM positions WHERE status='closed' AND close_time >= datetime('now', '-' + ? + ' days')"
    ).all(days);
    const wins = rows.filter(r => r.pnl > 0);
    const losses = rows.filter(r => r.pnl <= 0);
    const totalPnl = rows.reduce((s, r) => s + r.pnl, 0);
    return {
      total: rows.length,
      wins: wins.length,
      losses: losses.length,
      winRate: rows.length > 0 ? ((wins.length / rows.length) * 100).toFixed(1) : '0.0',
      totalPnl,
      avgPnl: rows.length > 0 ? totalPnl / rows.length : 0,
      best: rows.length > 0 ? Math.max(...rows.map(r => r.pnl)) : 0,
      worst: rows.length > 0 ? Math.min(...rows.map(r => r.pnl)) : 0,
    };
  }

  #ts() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }

  stop() { this.#intervals.forEach(i => clearInterval(i)); this.#intervals = []; }
}
