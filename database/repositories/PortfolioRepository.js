import { BaseRepository } from './BaseRepository.js';

export class PortfolioRepository extends BaseRepository {
  constructor(database) { super(database, 'portfolio'); }

  getCurrent() {
    return this.db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get();
  }

  initialize(balance) {
    const existing = this.getCurrent();
    if (!existing) {
      this.db.prepare('INSERT INTO portfolio (balance, equity) VALUES (?, ?)').run(balance, balance);
    }
  }

  ensureExists(balance) {
    if (!this.getCurrent()) this.initialize(balance);
  }

  updateBalance(pnl, isWin) {
    this.ensureExists(0);
    this.db.prepare(
      "UPDATE portfolio SET balance=balance+?,realized_pnl=realized_pnl+?,daily_pnl=daily_pnl+?,weekly_pnl=weekly_pnl+?,monthly_pnl=monthly_pnl+?,total_trades=total_trades+1,winning_trades=winning_trades+CASE WHEN ?>0 THEN 1 ELSE 0 END,losing_trades=losing_trades+CASE WHEN ?<=0 THEN 1 ELSE 0 END,updated_at=datetime('now') WHERE id=(SELECT id FROM portfolio ORDER BY id DESC LIMIT 1)"
    ).run(pnl, pnl, pnl, pnl, pnl, pnl, pnl);
  }

  updateWinRate() {
    const stats = this.db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins FROM positions WHERE status='closed'").get();
    if (stats.total > 0) {
      const winRate = (stats.wins / stats.total) * 100;
      this.db.prepare("UPDATE portfolio SET win_rate=? WHERE id=(SELECT id FROM portfolio ORDER BY id DESC LIMIT 1)").run(winRate);
    }
  }

  resetDaily() {
    this.db.prepare("UPDATE portfolio SET daily_pnl=0,updated_at=datetime('now')").run();
  }
}
