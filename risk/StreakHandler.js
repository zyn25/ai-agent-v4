/**
 * Win/Loss streak handler.
 * Adjusts position sizing based on recent performance.
 * - After 3 consecutive losses: reduce size by 50%
 * - After 5 consecutive losses: stop trading
 * - After 3 consecutive wins: increase size by 25%
 * - After 5 consecutive wins: increase size by 50%
 */
export class StreakHandler {
  #db; #logger; #config;
  constructor(database, logger, config) {
    this.#db = database;
    this.#logger = logger;
    this.#config = config;
  }

  /**
   * Get current streak and recommended size multiplier
   * @returns {object} - { streak, type, multiplier, reason }
   */
  getStreakInfo() {
    const trades = this.#db.prepare(
      "SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 20"
    ).all();

    if (!trades.length) {
      return { streak: 0, type: 'none', multiplier: 1.0, reason: 'No trades yet' };
    }

    let winStreak = 0;
    let lossStreak = 0;

    for (const t of trades) {
      if (t.pnl > 0) {
        if (lossStreak > 0) break;
        winStreak++;
      } else {
        if (winStreak > 0) break;
        lossStreak++;
      }
    }

    const streak = Math.max(winStreak, lossStreak);
    const type = winStreak > lossStreak ? 'win' : 'loss';

    let multiplier = 1.0;
    let reason = 'Normal sizing';

    if (type === 'loss') {
      if (streak >= 5) {
        multiplier = 0;
        reason = 'STOP: 5 consecutive losses';
      } else if (streak >= 4) {
        multiplier = 0.25;
        reason = 'Severe: 4 losses, size 25%';
      } else if (streak >= 3) {
        multiplier = 0.5;
        reason = 'Reduced: 3 losses, size 50%';
      }
    } else if (type === 'win') {
      if (streak >= 5) {
        multiplier = 1.5;
        reason = 'Hot: 5 wins, size 150%';
      } else if (streak >= 3) {
        multiplier = 1.25;
        reason = 'Warm: 3 wins, size 125%';
      }
    }

    return { streak, type, multiplier, reason };
  }

  /**
   * Apply streak adjustment to position size
   */
  adjustSize(originalSize) {
    const info = this.getStreakInfo();
    const adjusted = originalSize * info.multiplier;

    if (info.multiplier !== 1.0) {
      this.#logger.trade('Streak adjustment: ' + info.reason + ' | Size: ' + originalSize.toFixed(4) + ' → ' + adjusted.toFixed(4));
    }

    return {
      size: adjusted,
      streak: info,
      adjusted: info.multiplier !== 1.0
    };
  }

  /**
   * Check if trading should be paused due to streak
   */
  shouldPause() {
    const info = this.getStreakInfo();
    return {
      pause: info.multiplier === 0,
      reason: info.reason
    };
  }
}
