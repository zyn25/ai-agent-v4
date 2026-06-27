import { appendFileSync, mkdirSync, existsSync, statSync, renameSync } from 'fs';
import { join } from 'path';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_FILES = { trade: 'trade.log', error: 'error.log', telegram: 'telegram.log', system: 'system.log', ai: 'ai.log', performance: 'performance.log' };

export class Logger {
  #config; #level; #logDir;
  constructor(config) {
    this.#config = config;
    this.#level = LEVELS[config.logging.level] || LEVELS.info;
    this.#logDir = join(process.cwd(), 'logs');
    if (!existsSync(this.#logDir)) mkdirSync(this.#logDir, { recursive: true });
  }
  debug(msg, ...a) { this.#log('debug', 'system', msg, a); }
  info(msg, ...a) { this.#log('info', 'system', msg, a); }
  warn(msg, ...a) { this.#log('warn', 'system', msg, a); }
  error(msg, ...a) { this.#log('error', 'system', msg, a); }
  trade(msg, ...a) { this.#log('info', 'trade', msg, a); }
  telegram(msg, ...a) { this.#log('info', 'telegram', msg, a); }
  ai(msg, ...a) { this.#log('info', 'ai', msg, a); }
  #log(level, category, msg, args) {
    if (LEVELS[level] < this.#level) return;
    const ts = new Date().toISOString();
    const fmt = args.length > 0 ? `${msg} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}` : msg;
    const line = `[${ts}] [${level.toUpperCase()}] ${fmt}`;
    console.log(line);
    this.#write(category, line);
    if (level === 'error') this.#write('error', line);
  }
  #write(cat, line) {
    try {
      const fp = join(this.#logDir, LOG_FILES[cat] || 'system.log');
      if (existsSync(fp)) { const s = statSync(fp); if (s.size / 1048576 >= this.#config.logging.maxSizeMB) renameSync(fp, `${fp}.${Date.now()}`); }
      appendFileSync(fp, line + '\n');
    } catch {}
  }
}
