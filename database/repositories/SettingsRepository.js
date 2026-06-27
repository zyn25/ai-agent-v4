import { BaseRepository } from './BaseRepository.js';

export class SettingsRepository extends BaseRepository {
  constructor(database) { super(database, 'settings'); }

  get(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : null;
  }

  set(key, value) {
    return this.db.prepare(
      "INSERT INTO settings (key,value,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at"
    ).run(key, JSON.stringify(value));
  }

  getAll() {
    const rows = this.db.prepare('SELECT key,value FROM settings').all();
    const result = {};
    for (const r of rows) result[r.key] = JSON.parse(r.value);
    return result;
  }
}
