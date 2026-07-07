export class ReportService {
  #config; #logger; #db; #telegram; #intervals;
  #lastDaily; #lastWeekly; #lastMonthly;

  constructor(config, logger, db, tg) {
    this.#config = config; this.#logger = logger; this.#db = db; this.#telegram = tg;
    this.#intervals = [];
    this.#lastDaily = null;
    this.#lastWeekly = null;
    this.#lastMonthly = null;
  }

  start() {
    this.#intervals.push(setInterval(() => {
      const n = new Date();
      const today = n.toDateString();
      const dateStr = n.toISOString().substring(0, 10);

      if (this.#lastDaily !== today && n.getHours() === 0) {
        this.#lastDaily = today;
        this.#daily();
      }

      if (this.#lastWeekly !== today && n.getDay() === 0 && n.getHours() === 0) {
        this.#lastWeekly = today;
        this.#weekly();
      }

      if (this.#lastMonthly !== today && n.getDate() === 1 && n.getHours() === 0) {
        this.#lastMonthly = today;
        this.#monthly();
      }
    }, 60000));
    this.#logger.info('Report service started (daily + weekly + monthly)');
  }

  async #daily() {
    try {
      // FIX: Get all closed trades from yesterday using date comparison
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yDate = yesterday.toISOString().substring(0, 10);

      const trades = this.#db.prepare(
        "SELECT * FROM positions WHERE status='closed'"
      ).all();

      // Filter by date in JavaScript (more reliable than SQLite date functions)
      const dayTrades = trades.filter(t => {
        if (!t.close_time) return false;
        return t.close_time.substring(0, 10) === yDate;
      });

      const wins = dayTrades.filter(t => t.pnl > 0);
      const losses = dayTrades.filter(t => t.pnl <= 0);
      const totalPnl = dayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
      const wr = dayTrades.length > 0 ? ((wins.length / dayTrades.length) * 100).toFixed(1) : '0.0';
      const t = new Date().toISOString().replace('T', ' ').substring(0, 19);

      await this.#telegram.sendReport(
        '📊 <b>DAILY REPORT</b> (' + yDate + ')\n\n' +
        'Trades: ' + dayTrades.length + '\n' +
        'Wins: ' + wins.length + ' | Losses: ' + losses.length + '\n' +
        'Win Rate: ' + wr + '%\n' +
        'PnL: ' + (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2) + '\n\n' +
        '🕐 ' + t
      );

      this.#logger.info('Daily report sent: ' + dayTrades.length + ' trades');
    } catch (e) { this.#logger.error('Daily report:', e.message); }
  }

  async #weekly() {
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const wDate = weekAgo.toISOString().substring(0, 10);

      const trades = this.#db.prepare(
        "SELECT * FROM positions WHERE status='closed'"
      ).all();

      const weekTrades = trades.filter(t => {
        if (!t.close_time) return false;
        return t.close_time.substring(0, 10) >= wDate;
      });

      const wins = weekTrades.filter(t => t.pnl > 0);
      const losses = weekTrades.filter(t => t.pnl <= 0);
      const totalPnl = weekTrades.reduce((s, t) => s + (t.pnl || 0), 0);
      const wr = weekTrades.length > 0 ? ((wins.length / weekTrades.length) * 100).toFixed(1) : '0.0';
      const t = new Date().toISOString().replace('T', ' ').substring(0, 19);

      await this.#telegram.sendReport(
        '📊 <b>WEEKLY REPORT</b>\n\n' +
        'Trades: ' + weekTrades.length + '\n' +
        'Wins: ' + wins.length + ' | Losses: ' + losses.length + '\n' +
        'Win Rate: ' + wr + '%\n' +
        'PnL: ' + (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2) + '\n\n' +
        '🕐 ' + t
      );
    } catch (e) { this.#logger.error('Weekly report:', e.message); }
  }

  async #monthly() {
    try {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      const mDate = monthAgo.toISOString().substring(0, 10);

      const trades = this.#db.prepare(
        "SELECT * FROM positions WHERE status='closed'"
      ).all();

      const monthTrades = trades.filter(t => {
        if (!t.close_time) return false;
        return t.close_time.substring(0, 10) >= mDate;
      });

      const wins = monthTrades.filter(t => t.pnl > 0);
      const losses = monthTrades.filter(t => t.pnl <= 0);
      const totalPnl = monthTrades.reduce((s, t) => s + (t.pnl || 0), 0);
      const wr = monthTrades.length > 0 ? ((wins.length / monthTrades.length) * 100).toFixed(1) : '0.0';
      const t = new Date().toISOString().replace('T', ' ').substring(0, 19);

      await this.#telegram.sendReport(
        '📊 <b>MONTHLY REPORT</b>\n\n' +
        'Trades: ' + monthTrades.length + '\n' +
        'Wins: ' + wins.length + ' | Losses: ' + losses.length + '\n' +
        'Win Rate: ' + wr + '%\n' +
        'PnL: ' + (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2) + '\n\n' +
        '🕐 ' + t
      );
    } catch (e) { this.#logger.error('Monthly report:', e.message); }
  }

  stop() { this.#intervals.forEach(i => clearInterval(i)); this.#intervals = []; }
}
