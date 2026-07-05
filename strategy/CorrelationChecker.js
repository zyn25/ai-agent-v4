/**
 * Correlation checker.
 * Prevents opening correlated positions (e.g., BTC long + ETH long).
 * Reduces portfolio risk from concentration.
 */
export class CorrelationChecker {
  #db; #logger;
  #highCorrelationGroups;
  #l1Tokens;
  #maxSameSideMedium;

  constructor(database, logger, config = {}) {
    this.#db = database;
    this.#logger = logger;

    // Konfigurasi dari luar, fallback ke default
    this.#highCorrelationGroups = config.highCorrelationGroups ?? [
      ['BTC', 'ETH'],
      ['BTC', 'SOL'],
      ['ETH', 'SOL'],
      ['BTC', 'AVAX'],
      ['ETH', 'AVAX'],
      ['SOL', 'AVAX'],
      ['BTC', 'ADA'],
      ['BTC', 'DOT'],
      ['ETH', 'ADA'],
      ['ETH', 'DOT'],
      ['BTC', 'MATIC'],
      ['ETH', 'MATIC'],
    ];

    this.#l1Tokens = config.l1Tokens ?? [
      'BTC', 'ETH', 'SOL', 'AVAX', 'ADA', 'DOT', 'ATOM', 'NEAR', 'MATIC', 'SUI', 'APT', 'SEI',
    ];

    this.#maxSameSideMedium = config.maxSameSideMedium ?? 2;
  }

  /**
   * Check if opening a new position would create too much correlation
   * @param {string} newPair - e.g. "BTC/USDT"
   * @param {string} newSide - "long" or "short"
   * @returns {{ allowed: boolean, reason: string, correlation: string, caution: boolean }}
   */
  check(newPair, newSide) {
    // Validasi input
    if (!newPair || !newSide) {
      return {
        allowed: false,
        reason: 'Invalid input: pair and side required',
        correlation: 'unknown',
        caution: false,
      };
    }

    // Ambil posisi open dengan error handling
    let openPositions;
    try {
      openPositions = this.#db.prepare(
        "SELECT * FROM positions WHERE status='open'"
      ).all();
    } catch (e) {
      this.#logger.warn('CorrelationChecker: Gagal membaca posisi: ' + e.message);
      // Kalau gagal baca, izinkan saja (jangan blokir trading karena error DB)
      return {
        allowed: true,
        reason: 'DB read error, allowing by default',
        correlation: 'unknown',
        caution: true,
      };
    }

    if (!openPositions || !openPositions.length) {
      return {
        allowed: true,
        reason: 'No open positions',
        correlation: 'none',
        caution: false,
      };
    }

    const newBase = this.#getBaseAsset(newPair);

    // Check each open position
    for (const pos of openPositions) {
      // Validasi posisi
      if (!pos.pair || !pos.side) {
        this.#logger.warn('CorrelationChecker: Posisi tidak valid (missing pair/side), skip');
        continue;
      }

      const posBase = this.#getBaseAsset(pos.pair);
      const correlation = this.#getCorrelationByBase(newBase, posBase);

      // Same base asset → selalu tolak
      if (correlation === 'same') {
        return {
          allowed: false,
          reason: 'Already have position in ' + pos.pair + ' (' + posBase + ')',
          correlation: 'same',
          caution: false,
        };
      }

      // High correlation + same direction → tolak
      if (correlation === 'high' && newSide === pos.side) {
        return {
          allowed: false,
          reason: 'High correlation: ' + newPair + ' & ' + pos.pair + ' both ' + newSide,
          correlation: 'high',
          caution: false,
        };
      }

      // Medium correlation + same direction → cek jumlah
      if (correlation === 'medium' && newSide === pos.side) {
        // ✅ Hitung hanya posisi dengan korelasi medium/high + side sama
        const count = this.#countCorrelatedSameSide(openPositions, newSide, newBase);
        if (count >= this.#maxSameSideMedium) {
          return {
            allowed: false,
            reason: 'Too many ' + newSide + ' positions (' + count + ') with correlated pairs',
            correlation: 'medium',
            caution: false,
          };
        }
        // Izinkan tapi kasih caution
        return {
          allowed: true,
          reason: 'Medium correlation but acceptable (count: ' + count + ')',
          correlation: 'medium',
          caution: true,
        };
      }
    }

    return {
      allowed: true,
      reason: 'No correlation issues',
      correlation: 'low',
      caution: false,
    };
  }

  /**
   * Get correlation level between two base assets
   */
  #getCorrelationByBase(base1, base2) {
    if (base1 === base2) return 'same';

    // Cek high correlation groups
    for (const [a, b] of this.#highCorrelationGroups) {
      if ((base1 === a && base2 === b) || (base1 === b && base2 === a)) {
        return 'high';
      }
    }

    // Cek medium (keduanya L1 tokens)
    if (this.#l1Tokens.includes(base1) && this.#l1Tokens.includes(base2)) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Extract base asset from pair string.
   * Handles: "BTC/USDT", "BTC/USDT:USDT", "BTCUSDT", "BTC-USD"
   */
  #getBaseAsset(pair) {
    if (!pair || typeof pair !== 'string') return '';

    // Format: "BASE/QUOTE" atau "BASE/QUOTE:QUOTE"
    if (pair.includes('/')) {
      return pair.split('/')[0].trim();
    }

    // Format: "BASEQUOTE" (tanpa separator)
    // Coba ekstrak base dengan daftar quote umum
    const commonQuotes = ['USDT', 'USDC', 'USD', 'BUSD', 'DAI', 'BTC', 'ETH', 'BNB'];
    for (const quote of commonQuotes) {
      if (pair.endsWith(quote) && pair.length > quote.length) {
        return pair.slice(0, pair.length - quote.length);
      }
    }

    // Format: "BASE-QUOTE"
    if (pair.includes('-')) {
      return pair.split('-')[0].trim();
    }

    // Fallback: return apa adanya
    return pair;
  }

  /**
   * Count open positions with medium/high correlation and same side.
   * Excludes same base (already blocked earlier).
   */
  #countCorrelatedSameSide(positions, side, excludeBase) {
    let count = 0;
    for (const pos of positions) {
      if (!pos.pair || !pos.side) continue;
      if (pos.side !== side) continue;

      const posBase = this.#getBaseAsset(pos.pair);
      if (posBase === excludeBase) continue; // Skip same base

      const corr = this.#getCorrelationByBase(excludeBase, posBase);
      if (corr === 'high' || corr === 'medium') {
        count++;
      }
    }
    return count;
  }
}
