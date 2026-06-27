import { BaseRepository } from './BaseRepository.js';

export class SystemLogRepository extends BaseRepository {
  constructor(database) { super(database, 'system_logs'); }

  log(level, category, message, details = null) {
    return this.db.prepare(
      'INSERT INTO system_logs (level,category,message,details) VALUES (?,?,?,?)'
    ).run(level, category, message, details ? JSON.stringify(details) : null);
  }

  findRecent(limit = 50) {
    return this.db.prepare('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?').all(limit);
  }

  findByMessage(pattern, limit = 10) {
    return this.db.prepare(
      'SELECT * FROM system_logs WHERE message LIKE ? ORDER BY created_at DESC LIMIT ?'
    ).all(`%${pattern}%`, limit);
  }
}
