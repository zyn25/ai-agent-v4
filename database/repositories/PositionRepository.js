import { BaseRepository } from './BaseRepository.js';

export class PositionRepository extends BaseRepository {
  constructor(database) { super(database, 'positions'); }

  create(pos) {
    return this.db.prepare(
      "INSERT INTO positions (id,pair,side,entry_price,quantity,leverage,stop_loss,take_profit,status,ai_confidence,ai_decision,strategy_version,open_time) VALUES (@id,@pair,@side,@entry_price,@quantity,@leverage,@stop_loss,@take_profit,@status,@ai_confidence,@ai_decision,@strategy_version,@open_time)"
    ).run(pos);
  }

  update(id, fields) {
    const keys = Object.keys(fields);
    const sets = keys.map(k => `${k}=@${k}`).join(', ');
    return this.db.prepare(`UPDATE positions SET ${sets},updated_at=datetime('now') WHERE id=@id`).run({ id, ...fields });
  }

  findOpen() {
    return this.db.prepare("SELECT * FROM positions WHERE status='open' ORDER BY open_time DESC").all();
  }

  findClosedToday() {
    return this.db.prepare("SELECT * FROM positions WHERE status='closed' AND date(close_time)=date('now')").all();
  }

  findClosedBetween(start, end) {
    return this.db.prepare("SELECT * FROM positions WHERE status='closed' AND close_time BETWEEN ? AND ?").all(start, end);
  }

  getStats() {
    return this.db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins, SUM(CASE WHEN pnl<=0 THEN 1 ELSE 0 END) as losses, COALESCE(SUM(pnl),0) as total_pnl, COALESCE(AVG(pnl),0) as avg_pnl, COALESCE(MAX(pnl),0) as best_trade, COALESCE(MIN(pnl),0) as worst_trade FROM positions WHERE status='closed'").get();
  }

  getDailyPnl() {
    return this.db.prepare("SELECT COALESCE(SUM(pnl),0) as pnl FROM positions WHERE status='closed' AND date(close_time)=date('now')").get().pnl;
  }

  getWeeklyPnl() {
    return this.db.prepare("SELECT COALESCE(SUM(pnl),0) as pnl FROM positions WHERE status='closed' AND close_time>=datetime('now','-7 days')").get().pnl;
  }

  getMonthlyPnl() {
    return this.db.prepare("SELECT COALESCE(SUM(pnl),0) as pnl FROM positions WHERE status='closed' AND close_time>=datetime('now','-30 days')").get().pnl;
  }

  getConsecutiveLosses() {
    const trades = this.db.prepare("SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 20").all();
    let count = 0;
    for (const t of trades) { if (t.pnl <= 0) count++; else break; }
    return count;
  }

  countOpen() {
    return this.db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='open'").get().c;
  }

  closePosition(id, price, pnl, roi, fees, slippage, reason, holdDuration) {
    return this.db.prepare(
      "UPDATE positions SET exit_price=?,pnl=?,roi=?,fees=?,slippage=?,status='closed',exit_reason=?,close_time=datetime('now'),hold_duration=?,updated_at=datetime('now') WHERE id=?"
    ).run(price, pnl, roi, fees, slippage, reason, holdDuration, id);
  }
}
