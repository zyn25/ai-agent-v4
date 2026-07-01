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

    // Volume check
    const volResult = this.#checkVolume(volumes);
    if (!volResult.pass) return { trade: false, reason: volResult.reason, score: 0 };

    // ATR volatility check - IMPROVED
    const atrResult = this.#checkVolatility(highs, lows, closes);
    if (!atrResult.pass) return { trade: false, reason: atrResult.reason, score: 0 };

    // Ranging market check - IMPROVED
    const rangeResult = this.#checkRanging(closes, highs, lows);
    if (!rangeResult.pass) return { trade: false, reason: rangeResult.reason, score: 0 };

    return { trade: true, reason: 'Market OK', score: 50 };
  }

  #checkVolume(volumes) {
    const vol = VolumeIndicator.calculate(volumes);
    const ratio = vol.ratio;
    if (ratio < 0.01 || isNaN(ratio)) {
      return { pass: false, reason: 'No volume', score: 0 };
    }
    return { pass: true, reason: 'Volume OK', score: 50, ratio };
  }

  // IMPROVED: Block market with ATR too low (choppy)
  #checkVolatility(highs, lows, closes) {
    const atr = ATRIndicator.calculate(highs, lows, closes, 14);
    if (!atr || !atr.length) return { pass: true, reason: 'No ATR', score: 50 };

    const currentATR = atr[atr.length - 1];
    const price = closes[closes.length - 1];
    const atrPct = (currentATR / price) * 100;

    // Block if ATR < 0.15% (too quiet, will get stopped out easily)
    if (atrPct < 0.15) {
      return { pass: false, reason: 'ATR too low (' + atrPct.toFixed(3) + '%)', score: 0 };
    }

    // Block if ATR > 5% (extreme volatility, dangerous)
    if (atrPct > 5.0) {
      return { pass: false, reason: 'ATR too high (' + atrPct.toFixed(1) + '%)', score: 0 };
    }

    return { pass: true, reason: 'ATR OK (' + atrPct.toFixed(2) + '%)', score: 50 };
  }

  // IMPROVED: Better ranging detection
  #checkRanging(closes, highs, lows) {
    const atr = ATRIndicator.calculate(highs, lows, closes, 14);
    if (!atr || !atr.length) return { pass: true, reason: 'No data', score: 50 };

    const currentATR = atr[atr.length - 1];
    const price = closes[closes.length - 1];
    const atrPct = (currentATR / price) * 100;

    // Check price movement vs ATR
    const last20 = closes.slice(-20);
    const high20 = Math.max(...last20);
    const low20 = Math.min(...last20);
    const range20 = ((high20 - low20) / low20) * 100;

    // If range is less than 2x ATR, market is ranging
    if (range20 < atrPct * 2) {
      return { pass: false, reason: 'Ranging (range:' + range20.toFixed(2) + '% < 2x ATR)', score: 0 };
    }

    return { pass: true, reason: 'Trending OK', score: 50 };
  }
}
