import { BaseRepository } from './BaseRepository.js';
export class PositionRepository extends BaseRepository {
  constructor(database) { super(database, 'positions'); }
  findOpen() { return this.db.prepare("SELECT * FROM positions WHERE status = 'open'").all(); }
  getDailyPnl() { return this.db.prepare("SELECT COALESCE(SUM(pnl),0) as pnl FROM positions WHERE status='closed' AND date(close_time)=date('now')").get().pnl; }
  getWeeklyPnl() { return this.db.prepare("SELECT COALESCE(SUM(pnl),0) as pnl FROM positions WHERE status='closed' AND close_time>=datetime('now','-7 days')").get().pnl; }
}
