import { BaseRepository } from './BaseRepository.js';
export class SignalRepository extends BaseRepository {
  constructor(database) { super(database, 'signals'); }
  create(s) { return this.db.prepare("INSERT INTO signals (pair,side,confidence,indicators,timeframe,ai_decision,ai_confidence,ai_reason,status) VALUES (@pair,@side,@confidence,@indicators,@timeframe,@aiDecision,@aiConfidence,@aiReason,@status)").run(s); }
}
