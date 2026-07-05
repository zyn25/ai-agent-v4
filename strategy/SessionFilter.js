/**
 * Trading session filter.
 * Trading 24/7 including weekends (crypto markets never close).
 * Only blocks extremely low liquidity periods.
 */
export class SessionFilter {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  check() {
    const now = new Date();
    const utcHour = now.getUTCHours();

    // FIX: Allow trading 24/7 including weekends
    // Only block extreme low liquidity (03:00-05:00 UTC)
    if (utcHour >= 3 && utcHour < 5) {
      return { trade: false, reason: 'Deep off-hours (03-05 UTC)', session: 'deep_off_hours' };
    }

    const session = this.#getSession(utcHour);
    return { trade: true, reason: session + ' session - trading allowed', session: session };
  }

  #getSession(hour) {
    if (hour >= 0 && hour < 8) return hour >= 6 ? 'late_asian' : 'asian';
    if (hour >= 8 && hour < 16) return hour >= 13 ? 'london_ny_overlap' : 'london';
    if (hour >= 16 && hour < 21) return 'new_york';
    return 'off_hours';
  }

  getSessionScore() {
    const hour = new Date().getUTCHours();
    if (hour >= 13 && hour < 16) return 100;
    if (hour >= 8 && hour < 13) return 85;
    if (hour >= 16 && hour < 21) return 80;
    if (hour >= 0 && hour < 6) return 60;
    if (hour >= 6 && hour < 8) return 45;
    return 25;
  }
}
