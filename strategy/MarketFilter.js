import { ATRIndicator } from './indicators/ATR.js';
import { VolumeIndicator } from './indicators/Volume.js';

export class MarketFilter {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  async check(ohlcv) {
    if (!ohlcv || ohlcv.length < 50) return { trade: false, reason: 'Data tidak cukup', score: 0 };
    const closes = ohlcv.map(c => c[4]);
    const highs = ohlcv.map(c => c[2]);
    const lows = ohlcv.map(c => c[3]);
    const volumes = ohlcv.map(c => c[5]);

    const volResult = this.#checkVolume(volumes);
    if (!volResult.pass) return { trade: false, reason: volResult.reason, score: 0 };

    // Hitung ATR sekali, teruskan ke pengecekan volatilitas & ranging
    const atr = ATRIndicator.calculate(highs, lows, closes, 14);

    const atrResult = this.#checkVolatility(closes, atr);
    if (!atrResult.pass) return { trade: false, reason: atrResult.reason, score: 0 };

    const rangeResult = this.#checkRanging(closes, highs, lows, atr);
    if (!rangeResult.pass) return { trade: false, reason: rangeResult.reason, score: 0 };

    return { trade: true, reason: 'Pasar OK', score: 50 };
  }

  #checkVolume(volumes) {
    const vol = VolumeIndicator.calculate(volumes);
    const ratio = vol.ratio;
    if (ratio < 0.01 || isNaN(ratio)) return { pass: false, reason: 'Tidak ada volume', score: 0 };
    return { pass: true, reason: 'Volume OK', score: 50, ratio };
  }

  #checkVolatility(closes, atr) {
    if (!atr || !atr.length) return { pass: true, reason: 'Tidak ada ATR', score: 50 };
    const currentATR = atr[atr.length - 1];
    const price = closes[closes.length - 1];
    const atrPct = (currentATR / price) * 100;
    if (atrPct < 0.15) return { pass: false, reason: 'ATR terlalu rendah (' + atrPct.toFixed(3) + '%)', score: 0 };
    if (atrPct > 5.0) return { pass: false, reason: 'ATR terlalu tinggi (' + atrPct.toFixed(1) + '%)', score: 0 };
    return { pass: true, reason: 'ATR OK (' + atrPct.toFixed(2) + '%)', score: 50 };
  }

  #checkRanging(closes, highs, lows, atr) {
    if (!atr || !atr.length) return { pass: true, reason: 'Tidak ada data', score: 50 };
    const currentATR = atr[atr.length - 1];
    const price = closes[closes.length - 1];
    const atrPct = (currentATR / price) * 100;

    // ✅ Sekarang pakai highs & lows, bukan closes
    const high20 = Math.max(...highs.slice(-20));
    const low20 = Math.min(...lows.slice(-20));

    // ✅ Jaga-jaga kalau low20 = 0
    if (low20 <= 0) return { pass: true, reason: 'Low20 tidak valid', score: 50 };

    const range20 = ((high20 - low20) / low20) * 100;
    if (range20 < atrPct * 2) return { pass: false, reason: 'Sideways (rentang:' + range20.toFixed(2) + '% < 2x ATR)', score: 0 };
    return { pass: true, reason: 'Trending OK', score: 50 };
  }
}
