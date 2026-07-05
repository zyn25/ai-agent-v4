/**
 * Multi-signal confirmation engine.
 * Requires multiple indicators to agree before generating signal.
 * Reduces false signals and improves win rate.
 */
export class ConfirmationEngine {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  /**
   * Analyze and confirm signal from multiple indicators
   * @param {object} data - OHLCV data with calculated indicators
   * @returns {object} - Confirmation result with score breakdown
   */
  confirm(data) {
    const { closes, highs, lows, volumes, indicators } = data;
    const results = [];
    let totalScore = 0;
    let confirmations = 0;
    let disqualifiers = 0;

    // 1. EMA Crossover (weight: 25)
    const emaResult = this.#checkEMA(indicators);
    results.push(emaResult);
    totalScore += emaResult.score;
    if (emaResult.confirmed) confirmations++;
    if (emaResult.disqualifier) disqualifiers++;

    // 2. RSI (weight: 20)
    const rsiResult = this.#checkRSI(indicators);
    results.push(rsiResult);
    totalScore += rsiResult.score;
    if (rsiResult.confirmed) confirmations++;
    if (rsiResult.disqualifier) disqualifiers++;

    // 3. MACD (weight: 25)
    const macdResult = this.#checkMACD(indicators);
    results.push(macdResult);
    totalScore += macdResult.score;
    if (macdResult.confirmed) confirmations++;
    if (macdResult.disqualifier) disqualifiers++;

    // 4. Volume (weight: 10)
    const volResult = this.#checkVolume(indicators);
    results.push(volResult);
    totalScore += volResult.score;
    if (volResult.confirmed) confirmations++;
    if (volResult.disqualifier) disqualifiers++;

    // 5. Price Action (weight: 10)
    const paResult = this.#checkPriceAction(closes, highs, lows);
    results.push(paResult);
    totalScore += paResult.score;
    if (paResult.confirmed) confirmations++;
    if (paResult.disqualifier) disqualifiers++;

    // 6. Momentum (weight: 10)
    const momResult = this.#checkMomentum(closes);
    results.push(momResult);
    totalScore += momResult.score;
    if (momResult.confirmed) confirmations++;
    if (momResult.disqualifier) disqualifiers++;

    // Need at least 3 confirmations and no disqualifiers
    const minConfirmations = this.#config.minConfirmations ?? 3;
    const confirmed = confirmations >= minConfirmations && disqualifiers === 0;

    // Tentukan side dari hasil
    const side = this.#determineSide(results);

    return {
      confirmed,
      score: totalScore,
      confirmations,
      disqualifiers,
      minRequired: minConfirmations,
      results,
      side,
      reason: confirmed
        ? confirmations + '/' + results.length + ' indicators agree (' + side + ')'
        : disqualifiers > 0
          ? 'Blocked by ' + disqualifiers + ' disqualifier(s)'
          : 'Only ' + confirmations + '/' + minConfirmations + ' confirmations (need ' + minConfirmations + ')'
    };
  }

  // ─── EMA ───────────────────────────────────────────────
  #checkEMA(indicators) {
    if (!indicators?.ema) {
      return { name: 'EMA', score: 0, confirmed: false, side: 'neutral', disqualifier: false };
    }

    const { cross, fast, slow } = indicators.ema;
    let score = 0;
    let confirmed = false;
    let side = 'neutral';

    if (cross === 'bullish') {
      score = 25; confirmed = true; side = 'long';
    } else if (cross === 'bearish') {
      score = -25; confirmed = true; side = 'short';
    } else if (cross === 'above') {
      score = 15; confirmed = true; side = 'long';
    } else if (cross === 'below') {
      score = -15; confirmed = true; side = 'short';
    }

    return {
      name: 'EMA',
      score,
      confirmed,
      side,
      disqualifier: false,
      detail: cross + (fast && slow ? ' (fast:' + fast.toFixed(2) + ' slow:' + slow.toFixed(2) + ')' : ''),
    };
  }

  // ─── RSI ───────────────────────────────────────────────
  #checkRSI(indicators) {
    if (!indicators?.rsi) {
      return { name: 'RSI', score: 0, confirmed: false, side: 'neutral', disqualifier: false };
    }

    const { value, interpret } = indicators.rsi;
    let score = 0;
    let confirmed = false;
    let side = 'neutral';
    let disqualifier = false;

    // Disqualifier hanya di ekstrem (>85 atau <15), bukan 80/20
    if (value > 85) {
      disqualifier = true;
      side = 'short';
      // Tidak kasih score karena disqualifier
    } else if (value < 15) {
      disqualifier = true;
      side = 'long';
    } else if (interpret === 'overbought') {
      // 70-85: sinyal short, bukan disqualifier
      score = -15;
      confirmed = true;
      side = 'short';
    } else if (interpret === 'oversold') {
      // 15-30: sinyal long
      score = 15;
      confirmed = true;
      side = 'long';
    } else if (value >= 50 && value <= 65) {
      score = 20;
      confirmed = true;
      side = 'long';
    } else if (value >= 35 && value < 50) {
      score = -20;
      confirmed = true;
      side = 'short';
    }

    return {
      name: 'RSI',
      score,
      confirmed,
      side,
      disqualifier,
      detail: (value != null ? value.toFixed(1) : '?') + ' ' + (interpret ?? ''),
    };
  }

  // ─── MACD ──────────────────────────────────────────────
  #checkMACD(indicators) {
    if (!indicators?.macd) {
      return { name: 'MACD', score: 0, confirmed: false, side: 'neutral', disqualifier: false };
    }

    const { interpret } = indicators.macd;
    let score = 0;
    let confirmed = false;
    let side = 'neutral';

    if (interpret === 'bullish_cross') {
      score = 25; confirmed = true; side = 'long';
    } else if (interpret === 'bearish_cross') {
      score = -25; confirmed = true; side = 'short';
    } else if (interpret === 'bullish_momentum') {
      score = 15; confirmed = true; side = 'long';
    } else if (interpret === 'bearish_momentum') {
      score = -15; confirmed = true; side = 'short';
    }

    return {
      name: 'MACD',
      score,
      confirmed,
      side,
      disqualifier: false,
      detail: interpret ?? 'unknown',
    };
  }

  // ─── Volume ────────────────────────────────────────────
  #checkVolume(indicators) {
    if (!indicators?.volume) {
      return { name: 'Volume', score: 0, confirmed: false, side: 'neutral', disqualifier: false };
    }

    const { ratio, interpret } = indicators.volume;
    let score = 0;
    let confirmed = false;
    let disqualifier = false;

    if (ratio >= 1.5) {
      score = 10; confirmed = true;
    } else if (ratio >= 1.0) {
      score = 5; confirmed = true;
    } else if (ratio < 0.3) {
      // Volume sangat rendah → disqualifier
      disqualifier = true;
      score = -10;
    } else if (ratio < 0.5) {
      score = -5;
    }

    return {
      name: 'Volume',
      score,
      confirmed,
      side: 'neutral',
      disqualifier,
      detail: (interpret ?? '') + ' (' + (ratio != null ? ratio.toFixed(2) : '?') + ')',
    };
  }

  // ─── Price Action ──────────────────────────────────────
  #checkPriceAction(closes, highs, lows) {
    if (!closes || closes.length < 5) {
      return { name: 'PA', score: 0, confirmed: false, side: 'neutral', disqualifier: false };
    }

    const len = highs.length;

    // ✅ Pakai highs & lows, bukan closes
    const h0 = highs[len - 1];
    const h1 = highs[len - 2];
    const h2 = highs[len - 3];

    const l0 = lows[len - 1];
