import initSqlJs from 'sql.js';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { runMigrations } from './migrations/init.js';

export class Database {
  #config; #logger; #db = null; #dbPath;
  #dirty = false; #saveInterval = null;
  #saveLock = false;

  constructor(config, logger) {
    this.#config = config;
    this.#logger = logger;
  }

  async initialize() {
    const dir = join(process.cwd(), 'storage');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.#dbPath = join(dir, 'agent.db');
    const SQL = await initSqlJs();

    if (existsSync(this.#dbPath)) {
      const buf = readFileSync(this.#dbPath);
      this.#db = new SQL.Database(buf);
    } else {
      this.#db = new SQL.Database();
    }

    this.#db.run('PRAGMA foreign_keys = ON');
    runMigrations(this, this.#logger);

    this.#saveInterval = setInterval(() => {
      if (this.#dirty) {
        this.#saveNow();
        this.#dirty = false;
      }
    }, 10000);

    this.#saveNow();
    this.#logger.info('Database initialized');
  }

  get db() {
    if (!this.#db) throw new Error('Database not initialized');
    return this.#db;
  }

  prepare(sql) {
    const self = this;
    return {
      get(...p) {
        try {
          const s = self.db.prepare(sql);
          if (p.length) s.bind(p);
          if (s.step()) { const r = s.getAsObject(); s.free(); return r; }
          s.free(); return undefined;
        } catch (e) { self.#logger?.error('DB get error:', e.message); return undefined; }
      },
      all(...p) {
        try {
          const r = [];
          const s = self.db.prepare(sql);
          if (p.length) s.bind(p);
          while (s.step()) r.push(s.getAsObject());
          s.free(); return r;
        } catch (e) { self.#logger?.error('DB all error:', e.message); return []; }
      },
      run(...p) {
        try {
          self.db.run(sql, p);
          self.#dirty = true;
          return { changes: self.db.getRowsModified() };
        } catch (e) { self.#logger?.error('DB run error:', e.message); throw e; }
      },
    };
  }

  exec(sql) {
    this.db.run(sql);
    this.#dirty = true;
  }

  saveSync() {
    if (this.#saveLock) return;
    this.#saveNow();
    this.#dirty = false;
  }

  #saveNow() {
    if (this.#saveLock) return;
    try {
      this.#saveLock = true;
      const d = this.db.export();
      writeFileSync(this.#dbPath, Buffer.from(d));
    } catch (e) {
      this.#logger?.error('DB save error:', e.message);
    } finally {
      this.#saveLock = false;
    }
  }

  async close() {
    if (this.#saveInterval) {
      clearInterval(this.#saveInterval);
      this.#saveInterval = null;
    }
    if (this.#db) {
      this.#saveNow();
      this.#db.close();
      this.#db = null;
      this.#logger.info('Database closed');
    }
  }
}
