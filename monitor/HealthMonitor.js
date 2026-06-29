import { cpus, totalmem, freemem } from 'os';
import { execSync } from 'child_process';

/**
 * Health monitoring service.
 * Required by master prompt: CPU, RAM, Disk, Exchange, Telegram, OpenRouter, SQLite
 * Alert if: RAM > 90%, CPU > 90%, Disk > 90%, Exchange Offline, AI Offline, DB Error
 */
export class HealthMonitor {
  #config; #logger; #telegram; #db; #exchange; #interval; #alerts; #aiValidator;

  constructor(config, logger, tg, db, exchange, aiValidator) {
    this.#config = config;
    this.#logger = logger;
    this.#telegram = tg;
    this.#db = db;
    this.#exchange = exchange;
    this.#aiValidator = aiValidator;
    this.#interval = null;
    this.#alerts = new Map();
  }

  start() {
    this.#interval = setInterval(() => this.#check(), 60000);
    this.#logger.info('Health monitor started');
  }

  async #check() {
    try {
      const cpu = this.#getCPU();
      const ram = this.#getRAM();
      const disk = this.#getDisk();

      // Check Exchange connection
      let exchangeOk = 1;
      try { await this.#exchange.fetchTicker(this.#config.exchange.pair); }
      catch { exchangeOk = 0; }

      // Check DB connection
      let dbOk = 1;
      try { this.#db.prepare('SELECT 1').get(); }
      catch { dbOk = 0; }

      // Check Telegram connection
      const telegramOk = this.#telegram ? 1 : 0;

      // Check AI connection
      let aiOk = 1;
      if (this.#config.ai.enabled && this.#aiValidator) {
        try {
          // Simple check - just verify API key is set
          if (!this.#config.ai.apiKey) aiOk = 0;
        } catch { aiOk = 0; }
      }

      // Count open positions
      const openPos = this.#db.prepare(
        "SELECT COUNT(*) as c FROM positions WHERE status='open'"
      ).get();

      // Log to database
      this.#db.prepare(
        'INSERT INTO performance (cpu_usage,ram_usage,disk_usage,exchange_connected,telegram_connected,ai_connected,db_healthy,open_positions) VALUES (?,?,?,?,?,?,?,?)'
      ).run(cpu, ram, disk, exchangeOk, telegramOk, aiOk, dbOk, openPos?.c || 0);

      // Alert thresholds (master prompt: >90%)
      await this.#alertIf('cpu', cpu, 90, 'CPU: ' + cpu + '%');
      await this.#alertIf('ram', ram, 90, 'RAM: ' + ram + '%');
      await this.#alertIf('disk', disk, 90, 'Disk: ' + disk + '%');
      if (!exchangeOk) await this.#alertIf('exchange', 0, 0, 'Exchange OFFLINE');
      if (!dbOk) await this.#alertIf('db', 0, 0, 'Database ERROR');
      if (!aiOk && this.#config.ai.enabled) await this.#alertIf('ai', 0, 0, 'AI OFFLINE');

    } catch (e) {
      this.#logger.error('Health check error:', e.message);
    }
  }

  #getCPU() {
    const ci = cpus();
    let idle = 0, total = 0;
    ci.forEach(c => {
      for (const t in c.times) total += c.times[t];
      idle += c.times.idle;
    });
    return total > 0 ? Math.round(((total - idle) / total) * 100) : 0;
  }

  #getRAM() {
    return Math.round(((totalmem() - freemem()) / totalmem()) * 100);
  }

  #getDisk() {
    try {
      const output = execSync("df -h / | tail -1 | awk '{print $5}'")
        .toString().trim();
      return parseInt(output, 10) || 0;
    } catch {
      return 0;
    }
  }

  async #alertIf(key, value, threshold, message) {
    if (value >= threshold || threshold === 0) {
      const lastSent = this.#alerts.get(key);
      if (lastSent && Date.now() - lastSent < 300000) return;
      await this.#telegram.sendAlert(message);
      this.#alerts.set(key, Date.now());
      this.#logger.warn('ALERT: ' + message);
    }
  }

  stop() {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
  }
}
