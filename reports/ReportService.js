export class ReportService {
  #config; #logger; #database; #telegram; #intervals = []; #lastDaily = null; #lastWeekly = null;

  constructor(config, logger, db, tg) {
    this.#config = config; this.#logger = logger; this.#database = db; this.#telegram = tg;
  }

  start() {
    this.#intervals.push(setInterval(() => {
      const n = new Date();
      const today = n.toDateString();

      // Daily at midnight
      if (n.getHours() === 0 && n.getMinutes() === 0 && this.#lastDaily !== today) {
        this.#lastDaily = today;
        this.#daily();
      }

      // Weekly on Sunday at midnight
      if (n.getDay() === 0 && n.getHours() === 0 && n.getMinutes() === 0 && this.#lastWeekly !== today) {
        this.#lastWeekly = today;
        this.#weekly();
      }
    }, 60000));
    this.#logger.info('Report service started (daily + weekly)');
  }

  async #daily() {
    try {
      const r = this.#database.db.prepare(
        "SELECT COUNT(*) as t, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as w, COALESCE(SUM(pnl),0) as pnl, COALESCE(MAX(pnl),0) as best, COALESCE(MIN(pnl),0) as worst FROM positions WHERE status='closed' AND close_time>=datetime('now','-1 day')"
      ).get();
      const wr = r.t > 0 ? ((r.w / r.t) * 100).toFixed(1) : '0.0';
      const t = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await this.#telegram.sendReport(
        `📊 <b>DAILY REPORT</b>\n\nTrades: ${r.t}\nWins: ${r.w}\nLosses: ${r.t - r.w}\nWin Rate: ${wr}%\nPnL: $${r.pnl.toFixed(2)}\nBest: $${r.best.toFixed(2)}\nWorst: $${r.worst.toFixed(2)}\n\n🕐 ${t}`
      );
      this.#saveReport('daily', r);
    } catch (e) { this.#logger.error('Daily report error:', e.message); }
  }

  async #weekly() {
    try {
      const r = this.#database.db.prepare(
        "SELECT COUNT(*) as t, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as w, COALESCE(SUM(pnl),0) as pnl, COALESCE(AVG(pnl),0) as avg_pnl FROM positions WHERE status='closed' AND close_time>=datetime('now','-7 days')"
      ).get();
      const wr = r.t > 0 ? ((r.w / r.t) * 100).toFixed(1) : '0.0';
      const t = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await this.#telegram.sendReport(
        `📊 <b>WEEKLY REPORT</b>\n\nTrades: ${r.t}\nWins: ${r.w}\nLosses: ${r.t - r.w}\nWin Rate: ${wr}%\nPnL: $${r.pnl.toFixed(2)}\nAvg PnL: $${r.avg_pnl.toFixed(2)}\n\n🕐 ${t}`
      );
      this.#saveReport('weekly', r);
    } catch (e) { this.#logger.error('Weekly report error:', e.message); }
  }

  #saveReport(type, data) {
    try {
      this.#database.db.prepare(
        "INSERT INTO reports (type,period_start,period_end,data) VALUES (?,datetime('now','-1 day'),datetime('now'),?)"
      ).run(type, JSON.stringify(data));
    } catch {}
  }

  stop() { this.#intervals.forEach(i => clearInterval(i)); this.#intervals = []; }
}
