import { ATRIndicator } from './indicators/ATR.js';
import { VolumeIndicator } from './indicators/Volume.js';
import { EMAIndicator } from './indicators/EMA.js';

export class MarketFilter {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  async check(ohlcv) {
    if (!ohlcv || ohlcv.length < 50) {
      return { trade: false, reason: 'Insufficient data', score: 0 };
    }

    const closes = ohlcv.map(c => c[4]);
    const highs = ohlcv.map(c => c[2]);
    const lows = ohlcv.map(c => c[3]);
    const volumes = ohlcv.map(c => c[5]);

    // Volume check - very lenient (only block zero volume)
    const volResult = this.#checkVolume(volumes);
    if (!volResult.pass) {
      return { trade: false, reason: volResult.reason, score: 0 };
    }

    // Ranging check
    const rangeResult = this.#checkRanging(closes, highs, lows);
    if (!rangeResult.pass) {
      return { trade: false, reason: rangeResult.reason, score: 0 };
    }

    // Volatility check
    const volatResult = this.#checkVolatility(highs, lows, closes);
    if (!volatResult.pass) {
      return { trade: false, reason: volatResult.reason, score: 0 };
    }

    const trendResult = this.#checkTrendStrength(closes);
    const totalScore = (volResult.score + rangeResult.score + volatResult.score + trendResult.score) / 4;

    return { trade: true, reason: 'Market OK', score: totalScore };
  }

  #checkVolume(volumes) {
    const vol = VolumeIndicator.calculate(volumes);
    const ratio = vol.ratio;

    // Only block truly dead markets (no volume at all)
    if (ratio < 0.01 || isNaN(ratio)) {
      return { pass: false, reason: 'No volume (ratio: ' + ratio?.toFixed(4) + ')', score: 0, ratio };
    }

    // Always pass - just score for quality
    let score = 30;
    if (ratio >= 2.0) score = 100;
    else if (ratio >= 1.5) score = 90;
    else if (ratio >= 1.0) score = 80;
    else if (ratio >= 0.5) score = 60;
    else if (ratio >= 0.1) score = 40;

    return { pass: true, reason: 'Volume OK (ratio: ' + ratio.toFixed(4) + ')', score, ratio };
  }

  #checkRanging(closes, highs, lows) {
    const atr = ATRIndicator.calculate(highs, lows, closes, 14);
    if (!atr.length) return { pass: true, reason: 'No ATR data', score: 50 };

    const currentATR = atr[atr.length - 1];
    const currentPrice = closes[closes.length - 1];
    const atrPercent = (currentATR / currentPrice) * 100;

    const recentHighs = highs.slice(-20);
    const recentLows = lows.slice(-20);
    const highest = Math.max(...recentHighs);
    const lowest = Math.min(...recentLows);
    const range = ((highest - lowest) / lowest) * 100;

    const ema20 = EMAIndicator.calculate(closes, 20);
    const ema50 = EMAIndicator.calculate(closes, 50);
    let emaSpread = 0;
    if (ema20.length > 0 && ema50.length > 0) {
      emaSpread = Math.abs(ema20[ema20.length - 1] - ema50[ema50.length - 1]) / currentPrice * 100;
    }

    // Only block dead markets
    if (atrPercent < 0.05 && range < 0.3 && emaSpread < 0.02) {
      return { pass: false, reason: 'Dead market (ATR: ' + atrPercent.toFixed(3) + '%)', score: 0 };
    }

    let score = 50;
    if (atrPercent > 1.0) score = 90;
    else if (atrPercent > 0.5) score = 70;
    else if (atrPercent > 0.2) score = 60;

    return { pass: true, reason: 'Market active (ATR: ' + atrPercent.toFixed(2) + '%)', score };
  }

  #checkVolatility(highs, lows, closes) {
    const atr = ATRIndicator.calculate(highs, lows, closes, 14);
    if (!atr.length) return { pass: true, reason: 'No data', score: 50 };

    const currentATR = atr[atr.length - 1];
    const avgATR = atr.reduce((s, v) => s + v, 0) / atr.length;
    const volatilityRatio = currentATR / avgATR;

    // Only block extreme spikes
    if (volatilityRatio > 5.0) {
      return { pass: false, reason: 'Extreme spike (ratio: ' + volatilityRatio.toFixed(2) + ')', score: 0 };
    }

    let score = 50;
    if (volatilityRatio >= 0.8 && volatilityRatio <= 1.5) score = 90;
    else if (volatilityRatio >= 0.5 && volatilityRatio <= 2.0) score = 70;

    return { pass: true, reason: 'Volatility OK (ratio: ' + volatilityRatio.toFixed(2) + ')', score };
  }

  #checkTrendStrength(closes) {
    const ema20 = EMAIndicator.calculate(closes, 20);
    const ema50 = EMAIndicator.calculate(closes, 50);
    const ema100 = EMAIndicator.calculate(closes, 100);

    if (ema20.length < 2 || ema50.length < 2 || ema100.length < 2) return { score: 50 };

    const e20 = ema20[ema20.length - 1];
    const e50 = ema50[ema50.length - 1];
    const e100 = ema100[ema100.length - 1];

    if ((e20 > e50 && e50 > e100) || (e20 < e50 && e50 < e100)) return { score: 100, alignment: 'perfect' };
    if (e20 > e50 || e20 < e50) return { score: 60, alignment: 'partial' };
    return { score: 30, alignment: 'none' };
  }
}
