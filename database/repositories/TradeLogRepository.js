import { BaseRepository } from './BaseRepository.js';
export class TradeLogRepository extends BaseRepository {
  constructor(db) { super(db, 'trade_logs'); }
  log(pid,level,msg,d=null) { return this.db.prepare('INSERT INTO trade_logs (position_id,level,message,details) VALUES (?,?,?,?)').run(pid,level,msg,d?JSON.stringify(d):null); }
}
