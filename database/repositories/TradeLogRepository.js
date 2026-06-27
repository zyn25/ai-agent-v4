import { BaseRepository } from './BaseRepository.js';

export class TradeLogRepository extends BaseRepository {
  constructor(database) { super(database, 'trade_logs'); }

  log(positionId, level, message, details = null) {
    return this.db.prepare(
      'INSERT INTO trade_logs (position_id,level,message,details) VALUES (?,?,?,?)'
    ).run(positionId, level, message, details ? JSON.stringify(details) : null);
  }

  findByPosition(positionId) {
    return this.db.prepare('SELECT * FROM trade_logs WHERE position_id=? ORDER BY created_at').all(positionId);
  }
}
