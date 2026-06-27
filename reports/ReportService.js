export class ReportService {
  #config; #logger; #database; #telegram; #intervals = []; #lastDaily = null;
  constructor(config, logger, db, tg) { this.#config = config; this.#logger = logger; this.#database = db; this.#telegram = tg; }

  start() {
    this.#intervals.push(setInterval(() => {
      const n = new Date();
      // FIX: Prevent double-execute by tracking last sent date
      const today = n.toDateString();
      if (n.getHours() === 0 && n.getMinutes() === 0 && this.#lastDaily !== today) {
        this.#lastDaily = today;
        this.#daily();
      }
    }, 60000));
    this.#logger.info('Report service started');
  }

  async #daily() {
    try {
      const r = this.#database.db.prepare(
        "SELECT COUNT(*) as t, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as w, COALESCE(SUM(pnl),0) as pnl FROM positions WHERE status='closed' AND close_time>=datetime('now','-1 day')"
      ).get();
      const t = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await this.#telegram.sendReport(
        `📊 <b>DAILY REPORT</b>\n\nTrades: ${r.t}\nWins: ${r.w}\nLosses: ${r.t - r.w}\nPnL: $${r.pnl.toFixed(2)}\n\n🕐 ${t}`
      );
      this.#saveReport('daily', r);
    } catch (e) { this.#logger.error('Report error:', e.message); }
  }

  #saveReport(type, data) {
    try {
      this.#database.db.prepare(
        "INSERT INTO reports (type, period_start, period_end, data) VALUES (?, datetime('now','-1 day'), datetime('now'), ?)"
      ).run(type, JSON.stringify(data));
    } catch {}
  }

  stop() { this.#intervals.forEach(i => clearInterval(i)); this.#intervals = []; }
}
