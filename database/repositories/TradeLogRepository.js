import { BaseRepository } from './BaseRepository.js';
export class TradeLogRepository extends BaseRepository {
  constructor(database) { super(database, 'trade_logs'); }
  log(posId, level, msg, details = null) { this.db.prepare('INSERT INTO trade_logs (position_id,level,message,details) VALUES (?,?,?,?)').run(posId, level, msg, details ? JSON.stringify(details) : null); }
}
