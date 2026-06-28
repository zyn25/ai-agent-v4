import { BaseRepository } from './BaseRepository.js';
export class PortfolioRepository extends BaseRepository {
  constructor(db) { super(db, 'portfolio'); }
  getCurrent() { return this.db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get(); }
  initialize(b) { if(!this.getCurrent()) this.db.prepare('INSERT INTO portfolio (balance,equity) VALUES (?,?)').run(b,b); }
  ensureExists(b) { if(!this.getCurrent()) this.initialize(b); }
  updateBalance(pnl, isWin) { this.ensureExists(0); this.db.prepare("UPDATE portfolio SET balance=balance+?,realized_pnl=realized_pnl+?,daily_pnl=daily_pnl+?,weekly_pnl=weekly_pnl+?,monthly_pnl=monthly_pnl+?,total_trades=total_trades+1,winning_trades=winning_trades+CASE WHEN ?>0 THEN 1 ELSE 0 END,losing_trades=losing_trades+CASE WHEN ?<=0 THEN 1 ELSE 0 END,updated_at=datetime('now') WHERE id=(SELECT id FROM portfolio ORDER BY id DESC LIMIT 1)").run(pnl,pnl,pnl,pnl,pnl,pnl,pnl); }
  updateWinRate() { const s=this.db.prepare("SELECT COUNT(*) as total,SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins FROM positions WHERE status='closed'").get(); if(s&&s.total>0) this.db.prepare("UPDATE portfolio SET win_rate=? WHERE id=(SELECT id FROM portfolio ORDER BY id DESC LIMIT 1)").run((s.wins/s.total)*100); }
}
