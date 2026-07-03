export class EntryConfirmation {
  #logger;
  constructor(logger) { this.#logger = logger; }

  check(closes, opens, side, minCandles = 1) {
    if (!closes || closes.length < 5) {
      return { confirmed: true, reason: 'Insufficient data', score: 0 };
    }

    const last5 = closes.slice(-5);
    const score = { bullish: 0, bearish: 0 };

    for (let i = 1; i < last5.length; i++) {
      if (last5[i] > last5[i - 1]) score.bullish++;
      else if (last5[i] < last5[i - 1]) score.bearish++;
    }

    if (side === 'long') {
      if (score.bullish >= minCandles) {
        return { confirmed: true, reason: score.bullish + '/4 bullish', score: score.bullish };
      }
      return { confirmed: false, reason: 'No bullish candles', score: score.bullish };
    }

    if (side === 'short') {
      if (score.bearish >= minCandles) {
        return { confirmed: true, reason: score.bearish + '/4 bearish', score: score.bearish };
      }
      return { confirmed: false, reason: 'No bearish candles', score: score.bearish };
    }

    return { confirmed: false, reason: 'No direction', score: 0 };
  }
}
