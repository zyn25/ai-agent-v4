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

/**
 * Get disk usage info
 */
export function getDiskUsage() {
  try {
    const { execSync } = await import('child_process');
    const output = execSync("df -h / | tail -1").toString().trim();
    const parts = output.split(/\s+/);
    return {
      total: parts[1],
      used: parts[2],
      available: parts[3],
      percent: parts[4]
    };
  } catch {
    return { error: 'Cannot read disk' };
  }
}
