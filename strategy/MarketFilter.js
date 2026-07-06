import { ATRIndicator } from './indicators/ATR.js';
import { VolumeIndicator } from './indicators/Volume.js';
import { EMAIndicator } from './indicators/EMA.js';

export class MarketFilter {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  async check(ohlcv) {
    if (!ohlcv || ohlcv.length < 50) return { trade: false, reason: 'Insufficient data', score: 0 };

    const closes = ohlcv.map(c => c[4]);
    const highs = ohlcv.map(c => c[2]);
    const lows = ohlcv.map(c => c[3]);
    const volumes = ohlcv.map(c => c[5]);

    // Volume check
    const volResult = this.#checkVolume(volumes);
    if (!volResult.pass) return { trade: false, reason: volResult.reason, score: 0 };

    // IMPROVED: Better ranging detection
    const rangeResult = this.#checkRanging(closes, highs, lows);
    if (!rangeResult.pass) return { trade: false, reason: rangeResult.reason, score: 0 };

    // Volatility check
    const volatResult = this.#checkVolatility(highs, lows, closes);
    if (!volatResult.pass) return { trade: false, reason: volatResult.reason, score: 0 };

    return { trade: true, reason: 'Market OK', score: 50 };
  }

  #checkVolume(volumes) {
    const vol = VolumeIndicator.calculate(volumes);
    const ratio = vol.ratio;
    if (ratio < 0.01 || isNaN(ratio)) return { pass: false, reason: 'No volume', score: 0 };
    return { pass: true, reason: 'Volume OK', score: 50, ratio };
  }

  // IMPROVED: Better ranging detection using price action
  #checkRanging(closes, highs, lows) {
    if (closes.length < 20) return { pass: true, reason: 'Insufficient data', score: 50 };

    const current = closes[closes.length - 1];
    const recent20 = closes.slice(-20);
    const recent50 = closes.slice(-50);

    // Check if price is stuck in a range
    const high20 = Math.max(...recent20);
    const low20 = Math.min(...recent20);
    const range20 = ((high20 - low20) / low20) * 100;

    const high50 = Math.max(...recent50);
    const low50 = Math.min(...recent50);
    const range50 = ((high50 - low50) / low50) * 100;

    // IMPROVED: Check EMA convergence (EMAs too close = ranging)
    const ema20 = EMAIndicator.calculate(closes, 20);
    const ema50 = EMAIndicator.calculate(closes, 50);
    let emaSpread = 0;
    if (ema20.length > 0 && ema50.length > 0) {
      emaSpread = Math.abs(ema20[ema20.length - 1] - ema50[ema50.length - 1]) / current * 100;
    }

    // IMPROVED: Block if price is making lower highs AND higher lows (squeeze)
    const last10Highs = highs.slice(-10);
    const last10Lows = lows.slice(-10);
    let lowerHighs = 0, higherLows = 0;
    for (let i = 1; i < last10Highs.length; i++) {
      if (last10Highs[i] < last10Highs[i-1]) lowerHighs++;
      if (last10Lows[i] > last10Lows[i-1]) higherLows++;
    }
    const isSqueeze = lowerHighs >= 6 && higherLows >= 6;

    // IMPROVED: Block if range too narrow AND EMA spread too small
    if (range20 < 2.0 && emaSpread < 0.15) {
      return { pass: false, reason: 'Ranging market (range:' + range20.toFixed(2) + '%, EMA spread:' + emaSpread.toFixed(3) + '%)', score: 0 };
    }

    // Block squeeze pattern
    if (isSqueeze && range20 < 3.0) {
      return { pass: false, reason: 'Squeeze pattern (LH:' + lowerHighs + ' HL:' + higherLows + ')', score: 0 };
    }

    return { pass: true, reason: 'Market active (range:' + range20.toFixed(2) + '%)', score: 50 };
  }

  #checkVolatility(highs, lows, closes) {
    const atr = ATRIndicator.calculate(highs, lows, closes, 14);
    if (!atr || !atr.length) return { pass: true, reason: 'No ATR', score: 50 };
    const currentATR = atr[atr.length - 1];
    const avgATR = atr.reduce((s, v) => s + v, 0) / atr.length;
    const ratio = currentATR / avgATR;
    if (ratio > 5.0) return { pass: false, reason: 'Extreme volatility', score: 0 };
    return { pass: true, reason: 'Volatility OK', score: 50 };
  }
}
