import { BaseRepository } from './BaseRepository.js';

export class PerformanceRepository extends BaseRepository {
  constructor(database) { super(database, 'performance'); }

  log(data) {
    return this.db.prepare(
      'INSERT INTO performance (cpu_usage,ram_usage,disk_usage,exchange_connected,telegram_connected,ai_connected,db_healthy,open_positions) VALUES (@cpu,@ram,@disk,@exchange,@telegram,@ai,@db,@positions)'
    ).run(data);
  }

  findRecent(limit = 60) {
    return this.db.prepare('SELECT * FROM performance ORDER BY created_at DESC LIMIT ?').all(limit);
  }
}
