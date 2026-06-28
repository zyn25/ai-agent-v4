import { BaseRepository } from './BaseRepository.js';
export class PerformanceRepository extends BaseRepository {
  constructor(db) { super(db, 'performance'); }
  log(d) { return this.db.prepare('INSERT INTO performance (cpu_usage,ram_usage,disk_usage,exchange_connected,telegram_connected,ai_connected,db_healthy,open_positions) VALUES (?,?,?,?,?,?,?,?)').run(d.cpu,d.ram,d.disk,d.exchange,d.telegram,d.ai,d.db,d.positions); }
}
