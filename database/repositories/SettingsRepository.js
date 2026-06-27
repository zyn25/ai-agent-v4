import { BaseRepository } from './BaseRepository.js';
export class SettingsRepository extends BaseRepository {
  constructor(database) { super(database, 'settings'); }
  get(key) { const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? JSON.parse(r.value) : null; }
  set(key, value) { this.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(key, JSON.stringify(value)); }
}
