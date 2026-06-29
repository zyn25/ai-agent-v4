/**
 * Trading session filter.
 * Avoids low-liquidity periods (weekends, holidays, off-hours).
 * Required by master prompt: "Avoid low volume markets"
 */
export class SessionFilter {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  /**
   * Check if current time is good for trading
   * Returns: { trade: boolean, reason: string, session: string }
   */
  check() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDay = now.getUTCDay();
    const utcMinute = now.getUTCMinutes();

    // Weekend check (Saturday=6, Sunday=0)
    if (utcDay === 0 || utcDay === 6) {
      return { trade: false, reason: 'Weekend - markets closed', session: 'weekend' };
    }

    // Friday late session (after 20:00 UTC)
    if (utcDay === 5 && utcHour >= 20) {
      return { trade: false, reason: 'Friday late - low liquidity', session: 'friday_close' };
    }

    // Monday early (before 01:00 UTC)
    if (utcDay === 1 && utcHour < 1) {
      return { trade: false, reason: 'Monday early - gap risk', session: 'monday_open' };
    }

    // Define trading sessions
    const session = this.#getSession(utcHour, utcMinute);

    // Off-hours (low liquidity)
    if (session === 'off_hours') {
      return { trade: false, reason: 'Off-hours - low liquidity', session };
    }

    // Late Asian (reduced activity)
    if (session === 'late_asian') {
      return { trade: true, reason: 'Late Asian - reduced activity', session, caution: true };
    }

    return { trade: true, reason: session + ' session - good liquidity', session };
  }

  #getSession(hour, minute) {
    // Asian Session: 00:00 - 08:00 UTC (Tokyo, Shanghai)
    if (hour >= 0 && hour < 8) {
      if (hour >= 6) return 'late_asian';
      return 'asian';
    }

    // London Session: 08:00 - 16:00 UTC (London, Frankfurt)
    if (hour >= 8 && hour < 16) {
      // London-NY Overlap: 13:00 - 16:00 UTC (BEST liquidity)
      if (hour >= 13) return 'london_ny_overlap';
      return 'london';
    }

    // New York Session: 13:00 - 21:00 UTC (New York)
    if (hour >= 16 && hour < 21) {
      return 'new_york';
    }

    // Off-hours: 21:00 - 00:00 UTC
    return 'off_hours';
  }

  /**
   * Get session quality score (0-100)
   * Higher = better for trading
   */
  getSessionScore() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDay = now.getUTCDay();

    // Weekend = 0
    if (utcDay === 0 || utcDay === 6) return 0;

    // Best: London-NY overlap (13-16 UTC)
    if (utcHour >= 13 && utcHour < 16) return 100;

    // Good: London (8-13 UTC)
    if (utcHour >= 8 && utcHour < 13) return 85;

    // Good: New York (16-21 UTC)
    if (utcHour >= 16 && utcHour < 21) return 80;

    // OK: Asian (0-6 UTC)
    if (utcHour >= 0 && utcHour < 6) return 60;

    // Reduced: Late Asian (6-8 UTC)
    if (utcHour >= 6 && utcHour < 8) return 45;

    // Low: Off-hours (21-0 UTC)
    return 25;
  }
}
