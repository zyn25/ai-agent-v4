import { ATRIndicator } from './indicators/ATR.js';
import { VolumeIndicator } from './indicators/Volume.js';
import { EMAIndicator } from './indicators/EMA.js';

/**
 * Market condition filter.
 * Avoids low volume and ranging markets as required by master prompt.
 */
export class MarketFilter {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  /**
   * Check if market is suitable for trading
   * Returns: { trade: boolean, reason: string, score: number }
   */
  async check(ohlcv) {
    if (!ohlcv || ohlcv.length < 50) {
      return { trade: false, reason: 'Insufficient data', score: 0 };
    }

    const closes = ohlcv.map(c => c[4]);
    const highs = ohlcv.map(c => c[2]);
    const lows = ohlcv.map(c => c[3]);
    const volumes = ohlcv.map(c => c[5]);

    // 1. Volume check
    const volResult = this.#checkVolume(volumes);
    if (!volResult.pass) {
      return { trade: false, reason: 'Low volume: ' + volResult.reason, score: 0 };
    }

    // 2. Ranging market check
    const rangeResult = this.#checkRanging(closes, highs, lows);
    if (!rangeResult.pass) {
      return { trade: false, reason: 'Ranging market: ' + rangeResult.reason, score: 0 };
    }

    // 3. Volatility check
    const volatResult = this.#checkVolatility(highs, lows, closes);
    if (!volatResult.pass) {
      return { trade: false, reason: 'Volatility issue: ' + volatResult.reason, score: 0 };
    }

    // 4. Trend strength check
    const trendResult = this.#checkTrendStrength(closes);

    const totalScore = (volResult.score + rangeResult.score + volatResult.score + trendResult.score) / 4;

    return {
      trade: true,
      reason: 'Market OK',
      score: totalScore,
      volume: volResult,
      ranging: rangeResult,
      volatility: volatResult,
      trend: trendResult
    };
  }

  #checkVolume(volumes) {
    const vol = VolumeIndicator.calculate(volumes);
    const ratio = vol.ratio;

    if (ratio < 0.3) {
      return { pass: false, reason: 'Very low volume (ratio: ' + ratio.toFixed(2) + ')', score: 0, ratio };
    }
    if (ratio < 0.5) {
      return { pass: false, reason: 'Low volume (ratio: ' + ratio.toFixed(2) + ')', score: 20, ratio };
    }

    let score = 50;
    if (ratio >= 1.5) score = 90;
    else if (ratio >= 1.0) score = 70;
    else if (ratio >= 0.8) score = 60;

    return { pass: true, reason: 'Volume OK (ratio: ' + ratio.toFixed(2) + ')', score, ratio };
  }

  #checkRanging(closes, highs, lows) {
    // Use ATR relative to price to detect ranging market
    const atr = ATRIndicator.calculate(highs, lows, closes, 14);
    if (!atr.length) return { pass: true, reason: 'No ATR data', score: 50 };

    const currentATR = atr[atr.length - 1];
    const currentPrice = closes[closes.length - 1];
    const atrPercent = (currentATR / currentPrice) * 100;

    // Check if price is moving sideways using recent highs/lows
    const recentHighs = highs.slice(-20);
    const recentLows = lows.slice(-20);
    const highest = Math.max(...recentHighs);
    const lowest = Math.min(...recentLows);
    const range = ((highest - lowest) / lowest) * 100;

    // Check EMA convergence (ranging = EMAs close together)
    const ema20 = EMAIndicator.calculate(closes, 20);
    const ema50 = EMAIndicator.calculate(closes, 50);
    let emaSpread = 0;
    if (ema20.length > 0 && ema50.length > 0) {
      emaSpread = Math.abs(ema20[ema20.length - 1] - ema50[ema50.length - 1]) / currentPrice * 100;
    }

    // Ranging if: low ATR + narrow range + EMAs converged
    if (atrPercent < 0.3 && range < 2.0 && emaSpread < 0.2) {
      return { pass: false, reason: 'Sideways (ATR: ' + atrPercent.toFixed(2) + '%, Range: ' + range.toFixed(2) + '%)', score: 10, atrPercent, range, emaSpread };
    }

    let score = 50;
    if (atrPercent > 1.0) score = 90;
    else if (atrPercent > 0.5) score = 70;
    else if (atrPercent > 0.3) score = 60;

    return { pass: true, reason: 'Trending (ATR: ' + atrPercent.toFixed(2) + '%)', score, atrPercent, range, emaSpread };
  }

  #checkVolatility(highs, lows, closes) {
    const atr = ATRIndicator.calculate(highs, lows, closes, 14);
    if (!atr.length) return { pass: true, reason: 'No data', score: 50 };

    const currentATR = atr[atr.length - 1];
    const avgATR = atr.reduce((s, v) => s + v, 0) / atr.length;
    const volatilityRatio = currentATR / avgATR;

    // Too volatile (spike)
    if (volatilityRatio > 3.0) {
      return { pass: false, reason: 'Extreme volatility spike (ratio: ' + volatilityRatio.toFixed(2) + ')', score: 0, volatilityRatio };
    }

    // Too quiet
    if (volatilityRatio < 0.3) {
      return { pass: false, reason: 'Too quiet (ratio: ' + volatilityRatio.toFixed(2) + ')', score: 20, volatilityRatio };
    }

    let score = 50;
    if (volatilityRatio >= 0.8 && volatilityRatio <= 1.5) score = 90;
    else if (volatilityRatio >= 0.5 && volatilityRatio <= 2.0) score = 70;

    return { pass: true, reason: 'Volatility OK (ratio: ' + volatilityRatio.toFixed(2) + ')', score, volatilityRatio };
  }

  #checkTrendStrength(closes) {
    const ema20 = EMAIndicator.calculate(closes, 20);
    const ema50 = EMAIndicator.calculate(closes, 50);
    const ema100 = EMAIndicator.calculate(closes, 100);

    if (ema20.length < 2 || ema50.length < 2 || ema100.length < 2) {
      return { score: 50 };
    }

    const e20 = ema20[ema20.length - 1];
    const e50 = ema50[ema50.length - 1];
    const e100 = ema100[ema100.length - 1];

    // Perfect alignment: 20 > 50 > 100 (bullish) or 20 < 50 < 100 (bearish)
    if ((e20 > e50 && e50 > e100) || (e20 < e50 && e50 < e100)) {
      return { score: 100, alignment: 'perfect' };
    }

    // Partial alignment
    if (e20 > e50 || e20 < e50) {
      return { score: 60, alignment: 'partial' };
    }

    return { score: 30, alignment: 'none' };
  }
}
