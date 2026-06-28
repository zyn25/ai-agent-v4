import { BaseRepository } from './BaseRepository.js';
export class AILogRepository extends BaseRepository {
  constructor(db) { super(db, 'ai_logs'); }
  log(sid,req,res,tok,lat) { return this.db.prepare('INSERT INTO ai_logs (signal_id,request,response,tokens_used,latency_ms) VALUES (?,?,?,?,?)').run(sid,req,res,tok,lat); }
}
