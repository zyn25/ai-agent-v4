import { BaseRepository } from './BaseRepository.js';

export class AILogRepository extends BaseRepository {
  constructor(database) { super(database, 'ai_logs'); }

  log(signalId, request, response, tokensUsed, latencyMs) {
    return this.db.prepare(
      'INSERT INTO ai_logs (signal_id,request,response,tokens_used,latency_ms) VALUES (?,?,?,?,?)'
    ).run(signalId, request, response, tokensUsed, latencyMs);
  }

  findRecent(limit = 20) {
    return this.db.prepare('SELECT * FROM ai_logs ORDER BY created_at DESC LIMIT ?').all(limit);
  }
}
