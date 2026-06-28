import { BaseRepository } from './BaseRepository.js';
export class SignalRepository extends BaseRepository {
  constructor(db) { super(db, 'signals'); }
  create(s) { return this.db.prepare('INSERT INTO signals (pair,side,confidence,indicators,timeframe,ai_decision,ai_confidence,ai_reason,status) VALUES (?,?,?,?,?,?,?,?,?)').run(s.pair,s.side,s.confidence,s.indicators,s.timeframe,s.aiDecision,s.aiConfidence,s.aiReason,s.status); }
}
