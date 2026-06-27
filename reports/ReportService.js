export class ReportService {
  #config; #logger; #database; #telegram; #intervals = [];
  constructor(config, logger, db, tg) { this.#config = config; this.#logger = logger; this.#database = db; this.#telegram = tg; }
  start() {
    this.#intervals.push(setInterval(() => { const n = new Date(); if (n.getHours()===0&&n.getMinutes()===0) this.#daily(); }, 60000));
    this.#logger.info('Report service started');
  }
  async #daily() {
    try {
      const r = this.#database.db.prepare("SELECT COUNT(*) as t, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as w, SUM(pnl) as pnl FROM positions WHERE status='closed' AND close_time>=datetime('now','-1 day')").get();
      const t = new Date().toISOString().replace('T',' ').substring(0,19);
      await this.#telegram.sendReport(`📊 <b>DAILY</b>\n\nTrades: ${r.t}\nWins: ${r.w}\nPnL: $${(r.pnl||0).toFixed(2)}\n\n🕐 ${t}`);
    } catch (e) { this.#logger.error('Report error:', e.message); }
  }
  stop() { this.#intervals.forEach(i => clearInterval(i)); }
}
