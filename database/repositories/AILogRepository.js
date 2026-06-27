import { BaseRepository } from './BaseRepository.js';
export class AILogRepository extends BaseRepository {
  constructor(database) { super(database, 'ai_logs'); }
}
