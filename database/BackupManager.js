import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Automatic database backup manager.
 * Prevents data loss from corruption or accidental deletion.
 */
export class BackupManager {
  #dbPath; #backupDir; #logger; #interval; #maxBackups;

  constructor(dbPath, logger, maxBackups = 7) {
    this.#dbPath = dbPath;
    this.#backupDir = join(process.cwd(), 'storage', 'backups');
    this.#logger = logger;
    this.#maxBackups = maxBackups;

    if (!existsSync(this.#backupDir)) {
      mkdirSync(this.#backupDir, { recursive: true });
    }
  }

  /**
   * Start automatic daily backup
   */
  start() {
    // Backup every 6 hours
    this.#interval = setInterval(() => {
      this.backup();
    }, 6 * 60 * 60 * 1000);

    // Initial backup
    this.backup();
    this.#logger.info('Backup manager started (every 6h, max ' + this.#maxBackups + ' backups)');
  }

  /**
   * Create a backup now
   */
  backup() {
    try {
      if (!existsSync(this.#dbPath)) {
        this.#logger.warn('DB file not found for backup');
        return null;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const backupPath = join(this.#backupDir, 'agent_' + timestamp + '.db');

      copyFileSync(this.#dbPath, backupPath);

      this.#cleanup();
      this.#logger.info('Backup created: ' + backupPath);
      return backupPath;
    } catch (e) {
      this.#logger.error('Backup failed: ' + e.message);
      return null;
    }
  }

  /**
   * Restore from latest backup
   */
  restore() {
    try {
      const backups = this.#listBackups();
      if (!backups.length) {
        this.#logger.warn('No backups found');
        return false;
      }

      const latest = backups[backups.length - 1];
      copyFileSync(latest, this.#dbPath);
      this.#logger.info('Restored from: ' + latest);
      return true;
    } catch (e) {
      this.#logger.error('Restore failed: ' + e.message);
      return false;
    }
  }

  /**
   * List all backups
   */
  #listBackups() {
    try {
      return readdirSync(this.#backupDir)
        .filter(f => f.endsWith('.db'))
        .sort()
        .map(f => join(this.#backupDir, f));
    } catch {
      return [];
    }
  }

  /**
   * Remove old backups beyond max limit
   */
  #cleanup() {
    const backups = this.#listBackups();
    while (backups.length > this.#maxBackups) {
      const oldest = backups.shift();
      try {
        unlinkSync(oldest);
        this.#logger.info('Old backup removed: ' + oldest);
      } catch {}
    }
  }

  /**
   * Get backup status
   */
  getStatus() {
    const backups = this.#listBackups();
    const latest = backups.length ? backups[backups.length - 1] : null;
    const latestSize = latest ? statSync(latest).size : 0;

    return {
      count: backups.length,
      maxBackups: this.#maxBackups,
      latest: latest,
      latestSize: (latestSize / 1024).toFixed(1) + ' KB',
      backupDir: this.#backupDir
    };
  }

  stop() {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
  }
}
