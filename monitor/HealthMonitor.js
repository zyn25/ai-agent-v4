import { cpus, totalmem, freemem } from 'os';

export class HealthMonitor {
  #config; #logger; #telegram; #database; #exchange; #interval = null; #alertsSent = new Map();

  constructor(config, logger, tg, db, exchange) {
    this.#config = config; this.#logger = logger; this.#telegram = tg;
    this.#database = db; this.#exchange = exchange;
  }

  start() {
    this.#interval = setInterval(() => this.#check(), 60000);
    this.#logger.info('Health monitor started');
  }

  async #check() {
    try {
      const ci = cpus(); let idle = 0, total = 0;
      ci.forEach(c => { for (const t in c.times) total += c.times[t]; idle += c.times.idle; });
      const cpu = Math.round(((total - idle) / total) * 100);
      const ram = Math.round(((totalmem() - freemem()) / totalmem()) * 100);

      // Check exchange connection
      let exchangeOk = 1;
      try { await this.#exchange.fetchTicker(this.#config.exchange.pair); }
      catch { exchangeOk = 0; }

      // Check telegram connection
      const telegramOk = this.#telegram ? 1 : 0;

      // Check DB
      let dbOk = 1;
      try { this.#database.db.prepare('SELECT 1').get(); }
      catch { dbOk = 0; }

      // Count open positions
      const openPositions = this.#database.db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='open'").get().c;

      // Log to database
      this.#database.db.prepare(
        'INSERT INTO performance (cpu_usage,ram_usage,exchange_connected,telegram_connected,db_healthy,open_positions) VALUES (?,?,?,?,?,?)'
      ).run(cpu, ram, exchangeOk, telegramOk, dbOk, openPositions);

      // Alerts
      await this.#alertIf('cpu', cpu, 90, `CPU: ${cpu}%`);
      await this.#alertIf('ram', ram, 90, `RAM: ${ram}%`);
      if (!exchangeOk) await this.#alertIf('exchange', 0, 0, 'Exchange DISCONNECTED');
      if (!dbOk) await this.#alertIf('db', 0, 0, 'Database ERROR');

    } catch (e) { this.#logger.error('Health error:', e.message); }
  }

  async #alertIf(key, value, threshold, message) {
    if (value >= threshold || threshold === 0) {
      const lastSent = this.#alertsSent.get(key);
      if (lastSent && Date.now() - lastSent < 300000) return;
      await this.#telegram.sendAlert(message);
      this.#alertsSent.set(key, Date.now());
    }
  }

  stop() { if (this.#interval) { clearInterval(this.#interval); this.#interval = null; } }
}
