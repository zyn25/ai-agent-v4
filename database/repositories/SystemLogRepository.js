import { BaseRepository } from './BaseRepository.js';
export class SystemLogRepository extends BaseRepository {
  constructor(db) { super(db, 'system_logs'); }
  log(level,cat,msg,d=null) { return this.db.prepare('INSERT INTO system_logs (level,category,message,details) VALUES (?,?,?,?)').run(level,cat,msg,d?JSON.stringify(d):null); }
  findByMessage(p,limit=10) { return this.db.prepare('SELECT * FROM system_logs WHERE message LIKE ? ORDER BY created_at DESC LIMIT ?').all('%'+p+'%',limit); }
}
