import { BaseRepository } from './BaseRepository.js';
export class SettingsRepository extends BaseRepository {
  constructor(db) { super(db, 'settings'); }
  get(key) { const r=this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r?JSON.parse(r.value):null; }
  set(key, value) {
    const existing=this.get(key);
    if(existing!==null) return this.db.prepare("UPDATE settings SET value=?,updated_at=datetime('now') WHERE key=?").run(JSON.stringify(value),key);
    return this.db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(key,JSON.stringify(value));
  }
}
