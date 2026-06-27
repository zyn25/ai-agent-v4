import { cpus, totalmem, freemem } from 'os';

export class HealthMonitor {
  #config; #logger; #telegram; #database; #interval = null;
  constructor(config, logger, tg, db) { this.#config = config; this.#logger = logger; this.#telegram = tg; this.#database = db; }
  start() { this.#interval = setInterval(() => this.#check(), 60000); this.#logger.info('Health monitor started'); }
  async #check() {
    try {
      const ci = cpus(); let idle=0, total=0;
      ci.forEach(c => { for (const t in c.times) total+=c.times[t]; idle+=c.times.idle; });
      const cpu = Math.round(((total-idle)/total)*100);
      const ram = Math.round(((totalmem()-freemem())/totalmem())*100);
      this.#database.db.prepare('INSERT INTO performance (cpu_usage,ram_usage) VALUES (?,?)').run(cpu, ram);
      if (cpu>90) await this.#telegram.sendAlert(`CPU: ${cpu}%`);
      if (ram>90) await this.#telegram.sendAlert(`RAM: ${ram}%`);
    } catch (e) { this.#logger.error('Health error:', e.message); }
  }
  stop() { if (this.#interval) { clearInterval(this.#interval); this.#interval = null; } }
}
