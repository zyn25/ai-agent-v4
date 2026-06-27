import { BaseRepository } from './BaseRepository.js';
export class PerformanceRepository extends BaseRepository {
  constructor(database) { super(database, 'performance'); }
  log(d) { this.db.prepare('INSERT INTO performance (cpu_usage,ram_usage,disk_usage) VALUES (?,?,?)').run(d.cpu, d.ram, d.disk); }
}
