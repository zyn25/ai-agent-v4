export class EntryConfirmation {
  #logger;
  #maxLookback;

  constructor(logger, config = {}) {
    this.#logger = logger;
    this.#maxLookback = config.maxLookback ?? 5;
  }

  /**
   * Memeriksa konfirmasi entry berdasarkan momentum candle.
   * Membandingkan close-to-close dan juga body candle (open→close) untuk akurasi lebih baik.
   *
   * @param {number[]} closes - Array harga penutupan
   * @param {number[]} opens - Array harga pembukaan (opsional, untuk cek body candle)
   * @param {'long'|'short'} side - Arah trade
   * @param {number} minCandles - Minimum candle searah (default 2)
   * @returns {{ confirmed: boolean, reason: string, score: number }}
   */
  check(closes, opens, side, minCandles = 2) {
    // Validasi side di awal
    if (side !== 'long' && side !== 'short') {
      this.#logger.warn('EntryConfirmation: Invalid side: ' + side);
      return { confirmed: false, reason: 'Invalid side: ' + side, score: 0 };
    }

    // Validasi data
    if (!Array.isArray(closes) || closes.length < this.#maxLookback) {
      return { confirmed: false, reason: 'Insufficient data (need ' + this.#maxLookback + ' candles)', score: 0 };
    }

    const lastCloses = closes.slice(-this.#maxLookback);
    const totalComparisons = lastCloses.length - 1;

    // Validasi minCandles tidak melebihi jumlah perbandingan
    if (minCandles > totalComparisons) {
      return {
        confirmed: false,
        reason: 'minCandles (' + minCandles + ') > available comparisons (' + totalComparisons + ')',
        score: 0,
      };
    }

    // Hitung momentum: close-to-close + body candle (jika opens tersedia)
    const hasOpens = Array.isArray(opens) && opens.length >= this.#maxLookback;
    const lastOpens = hasOpens ? opens.slice(-this.#maxLookback) : null;

    let bullishCount = 0;
    let bearishCount = 0;

    for (let i = 1; i < lastCloses.length; i++) {
      const closeUp = lastCloses[i] > lastCloses[i - 1];
      const closeDown = lastCloses[i] < lastCloses[i - 1];

      if (hasOpens && lastOpens) {
        // Cek body candle: bullish = close > open, bearish = close < open
        const bodyBullish = lastCloses[i] > lastOpens[i];
        const bodyBearish = lastCloses[i] < lastOpens[i];

        // Close naik DAN body bullish → konfirmasi kuat
        if (closeUp && bodyBullish) {
          bullishCount++;
        }
        // Close turun DAN body bearish → konfirmasi kuat
        else if (closeDown && bodyBearish) {
          bearishCount++;
        }
        // Close naik tapi body bearish (gap down lalu recover) → tetap dihitung tapi setengah
        else if (closeUp && !bodyBullish) {
          bullishCount += 0.5;
        }
        // Close turun tapi body bullish (gap up lalu turun) → setengah
        else if (closeDown && !bodyBearish) {
          bearishCount += 0.5;
        }
      } else {
        // Tanpa opens, hanya bandingkan close-to-close
        if (closeUp) bullishCount++;
        else if (closeDown) bearishCount++;
      }
    }

    const effectiveCount = side === 'long' ? bullishCount : bearishCount;
    const directionLabel = side === 'long' ? 'bullish' : 'bearish';

    if (effectiveCount >= minCandles) {
      const result = {
        confirmed: true,
        reason: effectiveCount + '/' + totalComparisons + ' ' + directionLabel + ' (need ' + minCandles + ')',
        score: Math.round(effectiveCount * (100 / totalComparisons)),
      };
      this.#logger.debug('EntryConfirmation: ' + side + ' CONFIRMED - ' + result.reason);
      return result;
    }

    const result = {
      confirmed: false,
      reason: 'Only ' + effectiveCount + '/' + minCandles + ' ' + directionLabel + ' candles',
      score: Math.round(effectiveCount * (100 / totalComparisons)),
    };
    this.#logger.debug('EntryConfirmation: ' + side + ' REJECTED - ' + result.reason);
    return result;
  }
}
