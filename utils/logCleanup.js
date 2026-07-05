import { readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Automatic log cleanup to prevent disk full.
 * Deletes logs older than maxAgeDays.
 */
export function cleanupLogs(logDir, maxAgeDays = 30) {
  try {
    const files = readdirSync(logDir);
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    for (const file of files) {
      if (!file.endsWith('.log') && !file.includes('.log.')) continue;
      const filepath = join(logDir, file);
      const stats = statSync(filepath);
      if (stats.mtime.getTime() < cutoff) {
        unlinkSync(filepath);
        deleted++;
      }
    }

    return { deleted, remaining: files.length - deleted };
  } catch (e) {
    return { error: e.message };
  }
}
