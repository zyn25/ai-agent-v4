/**
 * Correlation checker.
 * Prevents opening correlated positions (e.g., BTC long + ETH long).
 * Reduces portfolio risk from concentration.
 */
export class CorrelationChecker {
  #db; #logger;
  constructor(database, logger) { this.#db = database; this.#logger = logger; }

  /**
   * Check if opening a new position would create too much correlation
   * @returns { allowed: boolean, reason: string, correlation: string }
   */
  check(newPair, newSide) {
    const openPositions = this.#db.prepare(
      "SELECT * FROM positions WHERE status='open'"
    ).all();

    if (!openPositions.length) {
      return { allowed: true, reason: 'No open positions', correlation: 'none' };
    }

    // Check each open position
    for (const pos of openPositions) {
      const correlation = this.#getCorrelation(newPair, pos.pair);

      // Same pair
      if (correlation === 'same') {
        return {
          allowed: false,
          reason: 'Already have position in ' + pos.pair,
          correlation: 'same'
        };
      }

      // High correlation + same direction = too much risk
      if (correlation === 'high' && newSide === pos.side) {
        return {
          allowed: false,
          reason: 'High correlation: ' + newPair + ' & ' + pos.pair + ' both ' + newSide,
          correlation: 'high'
        };
      }

      // Medium correlation + same direction = caution
      if (correlation === 'medium' && newSide === pos.side) {
        const count = this.#countSameSide(openPositions, newSide);
        if (count >= 2) {
          return {
            allowed: false,
            reason: 'Too many ' + newSide + ' positions (' + count + ') with correlated pairs',
            correlation: 'medium'
          };
        }
        return {
          allowed: true,
          reason: 'Medium correlation but acceptable',
          correlation: 'medium',
          caution: true
        };
      }
    }

    return { allowed: true, reason: 'No correlation issues', correlation: 'low' };
  }

  /**
   * Get correlation level between two pairs
   * Based on known crypto correlations
   */
  #getCorrelation(pair1, pair2) {
    const base1 = this.#getBaseAsset(pair1);
    const base2 = this.#getBaseAsset(pair2);

    // Same pair
    if (base1 === base2) return 'same';

    // High correlation groups
    const highCorrelation = [
      ['BTC', 'ETH'],
      ['BTC', 'SOL'],
      ['ETH', 'SOL'],
      ['BTC', 'AVAX'],
      ['ETH', 'AVAX'],
      ['SOL', 'AVAX'],
    ];

    for (const [a, b] of highCorrelation) {
      if ((base1 === a && base2 === b) || (base1 === b && base2 === a)) {
        return 'high';
      }
    }

    // Medium correlation (L1 tokens)
    const l1Tokens = ['BTC', 'ETH', 'SOL', 'AVAX', 'ADA', 'DOT', 'ATOM', 'NEAR'];
    if (l1Tokens.includes(base1) && l1Tokens.includes(base2)) {
      return 'medium';
    }

    return 'low';
  }

  #getBaseAsset(pair) {
    // BTC/USDT:USDT -> BTC
    return pair.split('/')[0];
  }

  #countSameSide(positions, side) {
    return positions.filter(p => p.side === side).length;
  }
}
