import { BaseRepository } from './BaseRepository.js';

export class SignalRepository extends BaseRepository {
  constructor(database) { super(database, 'signals'); }

  create(signal) {
    return this.db.prepare(
      "INSERT INTO signals (pair,side,confidence,indicators,timeframe,ai_decision,ai_confidence,ai_reason,status) VALUES (@pair,@side,@confidence,@indicators,@timeframe,@aiDecision,@aiConfidence,@aiReason,@status)"
    ).run(signal);
  }

  updateStatus(id, status) {
    return this.db.prepare('UPDATE signals SET status=? WHERE id=?').run(status, id);
  }

  findRecent(limit = 20) {
    return this.db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT ?').all(limit);
  }
}
