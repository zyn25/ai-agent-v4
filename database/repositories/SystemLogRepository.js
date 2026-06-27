import { BaseRepository } from './BaseRepository.js';
export class SystemLogRepository extends BaseRepository {
  constructor(database) { super(database, 'system_logs'); }
}
