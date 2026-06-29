import { EMAIndicator } from './indicators/EMA.js';
import { ATRIndicator } from './indicators/ATR.js';

/**
 * Trend strength analyzer.
 * Only trades when trend is strong enough.
 * Required by master prompt: "Never trade against higher timeframe trend"
 */
export class TrendStrength {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  /**
   * Analyze trend strength
   * @returns {object} - { strength: number (0-100), direction: string, grade: string }
   */
  analyze(closes, highs, lows) {
    if (!closes || closes.length < 200) {
      return { strength: 0, direction: 'unknown', grade: 'F', details: {} };
    }

    const scores = {};

    // 1. EMA Alignment (0-30 points)
    scores.ema = this.#emaAlignment(closes);

    // 2. Price vs EMA (0-20 points)
    scores.priceVsEma = this.#priceVsEma(closes);

    // 3. ADX-like trend measurement (0-25 points)
    scores.adx = this.#measureTrend(closes, highs, lows);

    // 4. Consecutive candles (0-15 points)
    scores.candles = this.#consecutiveCandles(closes);

    // 5. Higher timeframe momentum (0-10 points)
    scores.momentum = this.#longTermMomentum(closes);

    const total = Object.values(scores).reduce((s, v) => s + v.score, 0);
    const direction = this.#determineDirection(scores);
    const grade = this.#getGrade(total);

    return {
      strength: Math.min(total, 100),
      direction,
      grade,
      details: scores,
      tradeable: total >= 40
    };
  }

  #emaAlignment(closes) {
    const ema20 = EMAIndicator.calculate(closes, 20);
    const ema50 = EMAIndicator.calculate(closes, 50);
    const ema100 = EMAIndicator.calculate(closes, 100);

    if (!ema20.length || !ema50.length || !ema100.length) {
      return { score: 0, detail: 'No data' };
    }

    const e20 = ema20[ema20.length - 1];
    const e50 = ema50[ema50.length - 1];
    const e100 = ema100[ema100.length - 1];

    // Perfect bullish: 20 > 50 > 100
    if (e20 > e50 && e50 > e100) return { score: 30, detail: 'Perfect bullish alignment' };
    // Perfect bearish: 20 < 50 < 100
    if (e20 < e50 && e50 < e100) return { score: 30, detail: 'Perfect bearish alignment' };
    // Partial alignment
    if (e20 > e50) return { score: 15, detail: 'Partial bullish' };
    if (e20 < e50) return { score: 15, detail: 'Partial bearish' };

    return { score: 0, detail: 'No alignment' };
  }

  #priceVsEma(closes) {
    const ema50 = EMAIndicator.calculate(closes, 50);
    if (!ema50.length) return { score: 0, detail: 'No data' };

    const current = closes[closes.length - 1];
    const ema = ema50[ema50.length - 1];
    const distance = ((current - ema) / ema) * 100;

    if (Math.abs(distance) > 3) return { score: 20, detail: 'Price far from EMA (' + distance.toFixed(1) + '%)' };
    if (Math.abs(distance) > 1) return { score: 10, detail: 'Price near EMA (' + distance.toFixed(1) + '%)' };
    return { score: 5, detail: 'Price at EMA (' + distance.toFixed(1) + '%)' };
  }

  #measureTrend(closes, highs, lows) {
    const atr = ATRIndicator.calculate(highs, lows, closes, 14);
    if (!atr.length) return { score: 0, detail: 'No data' };

    const currentATR = atr[atr.length - 1];
    const avgATR = atr.reduce((s, v) => s + v, 0) / atr.length;
    const ratio = currentATR / avgATR;

    if (ratio > 1.5) return { score: 25, detail: 'Strong trend (ATR ratio: ' + ratio.toFixed(2) + ')' };
    if (ratio > 1.0) return { score: 15, detail: 'Normal trend (ATR ratio: ' + ratio.toFixed(2) + ')' };
    if (ratio > 0.5) return { score: 5, detail: 'Weak trend (ATR ratio: ' + ratio.toFixed(2) + ')' };
    return { score: 0, detail: 'No trend (ATR ratio: ' + ratio.toFixed(2) + ')' };
  }

  #consecutiveCandles(closes) {
    const last10 = closes.slice(-10);
    let upStreak = 0, downStreak = 0;

    for (let i = 1; i < last10.length; i++) {
      if (last10[i] > last10[i - 1]) { upStreak++; downStreak = 0; }
      else if (last10[i] < last10[i - 1]) { downStreak++; upStreak = 0; }
    }

    const maxStreak = Math.max(upStreak, downStreak);
    if (maxStreak >= 5) return { score: 15, detail: 'Strong streak (' + maxStreak + ')' };
    if (maxStreak >= 3) return { score: 8, detail: 'Moderate streak (' + maxStreak + ')' };
    return { score: 0, detail: 'No streak' };
  }

  #longTermMomentum(closes) {
    if (closes.length < 50) return { score: 0, detail: 'No data' };

    const current = closes[closes.length - 1];
    const prev50 = closes[closes.length - 50];
    const change = ((current - prev50) / prev50) * 100;

    if (Math.abs(change) > 10) return { score: 10, detail: 'Strong momentum (' + change.toFixed(1) + '%)' };
    if (Math.abs(change) > 5) return { score: 5, detail: 'Moderate momentum (' + change.toFixed(1) + '%)' };
    return { score: 0, detail: 'Weak momentum (' + change.toFixed(1) + '%)' };
  }

  #determineDirection(scores) {
    let long = 0, short = 0;
    if (scores.ema.detail?.includes('bullish')) long += scores.ema.score;
    if (scores.ema.detail?.includes('bearish')) short += scores.ema.score;
    if (scores.candles.detail?.includes('up')) long += scores.candles.score;
    if (scores.candles.detail?.includes('down')) short += scores.candles.score;
    return long > short ? 'bullish' : short > long ? 'bearish' : 'neutral';
  }

  #getGrade(score) {
    if (score >= 80) return 'A+';
    if (score >= 70) return 'A';
    if (score >= 60) return 'B+';
    if (score >= 50) return 'B';
    if (score >= 40) return 'C';
    if (score >= 30) return 'D';
    return 'F';
  }
}
