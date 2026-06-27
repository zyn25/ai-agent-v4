import { BaseRepository } from './BaseRepository.js';
export class PortfolioRepository extends BaseRepository {
  constructor(database) { super(database, 'portfolio'); }
  getCurrent() { return this.db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get(); }
  initialize(balance) { if (!this.getCurrent()) this.db.prepare('INSERT INTO portfolio (balance, equity) VALUES (?, ?)').run(balance, balance); }
}
