export class SessionFilter {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  /**
   * Check if current time is good for trading.
   * FIX: Crypto markets are 24/7. Weekend logic removed.
   */
  check() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    // Define trading sessions (Crypto 24/7)
    const session = this.#getSession(utcHour, utcMinute);

    // Off-hours (low liquidity in crypto usually around 21:00 - 00:00 UTC)
    if (session === 'off_hours') {
      return { trade: false, reason: 'Off-hours - low liquidity', session };
    }

    // Late Asian (reduced activity)
    if (session === 'late_asian') {
      return { trade: true, reason: 'Late Asian - reduced activity', session, caution: true };
    }

    return { trade: true, reason: session + ' session - good liquidity', session };
  }

  /**
   * Get current trading session based on UTC hour.
   * FIX: Clear separation of London and NY sessions.
   */
  #getSession(hour, minute) {
    // Asian Session: 00:00 - 08:00 UTC (Tokyo, Shanghai)
    if (hour >= 0 && hour < 8) {
      if (hour >= 6) return 'late_asian';
      return 'asian';
    }

    // London Session: 08:00 - 13:00 UTC
    if (hour >= 8 && hour < 13) {
      return 'london';
    }

    // London-NY Overlap: 13:00 - 16:00 UTC (BEST liquidity)
    if (hour >= 13 && hour < 16) {
      return 'london_ny_overlap';
    }

    // New York Session: 16:00 - 21:00 UTC
    if (hour >= 16 && hour < 21) {
      return 'new_york';
    }

    // Off-hours: 21:00 - 00:00 UTC
    return 'off_hours';
  }

  /**
   * Get session quality score (0-100).
   * Higher = better for trading.
   * FIX: Removed weekend score (crypto doesn't close).
   */
  getSessionScore() {
    const now = new Date();
    const utcHour = now.getUTCHours();

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

    // Low: Off-hours (21-00 UTC)
    return 25;
  }
}
