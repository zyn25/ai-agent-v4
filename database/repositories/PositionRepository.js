import { BaseRepository } from './BaseRepository.js';
export class PositionRepository extends BaseRepository {
  constructor(db) { super(db, 'positions'); }
  create(p) { return this.db.prepare('INSERT INTO positions (id,pair,side,entry_price,quantity,leverage,stop_loss,take_profit,status,ai_confidence,ai_decision,strategy_version,open_time,remaining_quantity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,p.pair,p.side,p.entry_price,p.quantity,p.leverage,p.stop_loss,p.take_profit,p.status,p.ai_confidence,p.ai_decision,p.strategy_version,p.open_time,p.quantity); }
  update(id, f) { const k=Object.keys(f); const s=k.map(x=>x+'=?').join(','); const v=k.map(x=>f[x]); return this.db.prepare('UPDATE positions SET '+s+',updated_at=datetime(\'now\') WHERE id=?').run(...v, id); }
  findOpen() { return this.db.prepare("SELECT * FROM positions WHERE status='open' ORDER BY open_time DESC").all(); }
  getDailyPnl() { const r=this.db.prepare("SELECT COALESCE(SUM(pnl),0) as pnl FROM positions WHERE status='closed' AND date(close_time)=date('now')").get(); return r?.pnl||0; }
  getWeeklyPnl() { const r=this.db.prepare("SELECT COALESCE(SUM(pnl),0) as pnl FROM positions WHERE status='closed' AND close_time>=datetime('now','-7 days')").get(); return r?.pnl||0; }
  getStats() { return this.db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins, SUM(CASE WHEN pnl<=0 THEN 1 ELSE 0 END) as losses, COALESCE(SUM(pnl),0) as total_pnl, COALESCE(AVG(pnl),0) as avg_pnl, COALESCE(MAX(pnl),0) as best_trade, COALESCE(MIN(pnl),0) as worst_trade FROM positions WHERE status='closed'").get(); }
  getConsecutiveLosses() { const t=this.db.prepare("SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 20").all(); let c=0; for(const x of t){if(x.pnl<=0)c++;else break;} return c; }
  countOpen() { const r=this.db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='open'").get(); return r?.c||0; }
  closePosition(id,price,pnl,roi,fees,slip,reason,hold) { return this.db.prepare("UPDATE positions SET exit_price=?,pnl=?,roi=?,fees=?,slippage=?,status='closed',exit_reason=?,close_time=datetime('now'),hold_duration=?,updated_at=datetime('now') WHERE id=?").run(price,pnl,roi,fees,slip,reason,hold,id); }
  partialClose(id,closeQty,closePnl,fees,slip,remainingQty,ptpIndex) {
    this.db.prepare("UPDATE positions SET closed_quantity=closed_quantity+?,remaining_quantity=?,partial_tp_index=?,updated_at=datetime('now') WHERE id=?").run(closeQty,remainingQty,ptpIndex,id);
  }
}
