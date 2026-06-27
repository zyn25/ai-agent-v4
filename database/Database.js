import DatabaseDriver from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { runMigrations } from './migrations/init.js';

export class Database {
  #config; #logger; #db = null;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }
  async initialize() {
    const dir = join(process.cwd(), 'storage');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.#db = new DatabaseDriver(join(dir, 'agent.db'));
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('busy_timeout = 5000');
    this.#db.pragma('synchronous = NORMAL');
    this.#db.pragma('foreign_keys = ON');
    runMigrations(this.#db, this.#logger);
    this.#logger.info('Database initialized');
  }
  get db() { if (!this.#db) throw new Error('DB not initialized'); return this.#db; }
  prepare(sql) { return this.db.prepare(sql); }
  async close() { if (this.#db) { this.#db.close(); this.#db = null; this.#logger.info('Database closed'); } }
}
