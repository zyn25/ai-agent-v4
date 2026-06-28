import initSqlJs from 'sql.js';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { runMigrations } from './migrations/init.js';

export class Database {
  #config; #logger; #db = null; #dbPath;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  async initialize() {
    console.log('[DB] Starting initialization...');
    const dir = join(process.cwd(), 'storage');
    if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); console.log('[DB] Created storage dir'); }
    this.#dbPath = join(dir, 'agent.db');
    console.log('[DB] Path:', this.#dbPath);
    console.log('[DB] Loading sql.js...');
    const SQL = await initSqlJs();
    console.log('[DB] sql.js loaded');
    if (existsSync(this.#dbPath)) {
      const buf = readFileSync(this.#dbPath);
      this.#db = new SQL.Database(buf);
      console.log('[DB] Existing DB loaded');
    } else {
      this.#db = new SQL.Database();
      console.log('[DB] New DB created');
    }
    this.#db.run('PRAGMA foreign_keys = ON');
    console.log('[DB] Running migrations...');
    runMigrations(this, this.#logger);
    console.log('[DB] Migrations done');
    this.#save();
    console.log('[DB] Saved');
    this.#logger.info('Database initialized');
  }

  get db() { if (!this.#db) throw new Error('DB not initialized'); return this.#db; }

  prepare(sql) {
    const self = this;
    return {
      get(...p) {
        try {
          const s = self.db.prepare(sql);
          if (p.length) s.bind(p);
          if (s.step()) { const r = s.getAsObject(); s.free(); return r; }
          s.free(); return undefined;
        } catch(e) { return undefined; }
      },
      all(...p) {
        try {
          const r = []; const s = self.db.prepare(sql);
          if (p.length) s.bind(p);
          while (s.step()) r.push(s.getAsObject());
          s.free(); return r;
        } catch(e) { return []; }
      },
      run(...p) {
        try {
          self.db.run(sql, p); self.#save();
          return { changes: self.db.getRowsModified() };
        } catch(e) { return { changes: 0 }; }
      }
    };
  }

  exec(sql) { this.db.run(sql); this.#save(); }

  #save() {
    try {
      const d = this.db.export();
      writeFileSync(this.#dbPath, Buffer.from(d));
    } catch(e) { console.error('[DB] Save error:', e.message); }
  }

  async close() {
    if (this.#db) { this.#save(); this.#db.close(); this.#db = null; console.log('[DB] Closed'); }
  }
}
