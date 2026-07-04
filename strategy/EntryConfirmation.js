export class EntryConfirmation {
  #logger;
  #maxLookback = 5;

  constructor(logger) {
    this.#logger = logger;
  }

  /**
   * Memeriksa konfirmasi entry berdasarkan momentum candle
   * @param {number[]} closes - Array harga penutupan
   * @param {number[]} opens - Array harga pembukaan
   * @param {'long'|'short'} side - Arah trade
   * @param {number} minCandles - Minimum candle searah
   * @returns {Object} { confirmed, reason, score }
   */
  check(closes, opens, side, minCandles = 2) {
    // FIX: Return false (not true) when data insufficient
    if (!Array.isArray(closes) || closes.length < this.#maxLookback) {
      return { confirmed: false, reason: 'Insufficient data', score: 0 };
    }

    const lastN = closes.slice(-this.#maxLookback);
    const maxPossible = lastN.length - 1;
    const score = { bullish: 0, bearish: 0 };

    for (let i = 1; i < lastN.length; i++) {
      if (lastN[i] > lastN[i - 1]) score.bullish++;
      else if (lastN[i] < lastN[i - 1]) score.bearish++;
    }

    if (side === 'long') {
      if (score.bullish >= minCandles) {
        return { confirmed: true, reason: score.bullish + '/' + maxPossible + ' bullish', score: score.bullish };
      }
      return { confirmed: false, reason: 'Only ' + score.bullish + '/' + minCandles + ' bullish', score: score.bullish };
    }

    if (side === 'short') {
      if (score.bearish >= minCandles) {
        return { confirmed: true, reason: score.bearish + '/' + maxPossible + ' bearish', score: score.bearish };
      }
      return { confirmed: false, reason: 'Only ' + score.bearish + '/' + minCandles + ' bearish', score: score.bearish };
    }

    return { confirmed: false, reason: 'Invalid side', score: 0 };
  }
}
