import { macd } from 'technicalindicators';

export class MACDIndicator {
  /**
   * Menghitung nilai MACD, Signal, dan Histogram.
   * @param {number[]} closes - Array harga penutupan
   * @param {number} fast - Fast period
   * @param {number} slow - Slow period
   * @param {number} signal - Signal period
   */
  static calculate(closes, fast, slow, signal) {
    // Guard: Cegah crash jika closes tidak cukup atau tidak valid
    if (!closes || closes.length < slow) {
      return { MACD: [], signal: [], histogram: [] };
    }

    try {
      const result = macd({
        values: closes,
        fastPeriod: fast,
        slowPeriod: slow,
        signalPeriod: signal,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });

      // Guard: Pastikan result adalah array yang valid
      if (!result || !Array.isArray(result) || result.length === 0) {
        return { MACD: [], signal: [], histogram: [] };
      }

      return {
        MACD: result.map(r => r.MACD ?? null),
        signal: result.map(r => r.signal ?? null),
        histogram: result.map(r => r.histogram ?? null),
      };
    } catch (e) {
      // Jika library error karena data NaN/undefined, kembalikan array kosong
      return { MACD: [], signal: [], histogram: [] };
    }
  }

  /**
   * Interpretasi nilai histogram MACD.
   * @param {number} m - Nilai MACD
   * @param {number} s - Nilai Signal
   * @param {number[]} h - Array Histogram
   */
  static interpret(m, s, h) {
    // Guard: Cegah crash jika histogram belum terbentuk
    if (!h || h.length < 2) return 'neutral';

    let c = null, p = null;
    
    // Cari 2 nilai histogram terakhir yang tidak null dari belakang
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i] !== null && h[i] !== undefined && !isNaN(h[i])) {
        if (c === null) {
          c = h[i];
        } else {
          p = h[i];
          break;
        }
      }
    }

    // Jika tidak ditemukan 2 nilai valid, kondisi market belum jelas
    if (c === null || p === null) return 'neutral';

    if (p <= 0 && c > 0) return 'bullish_cross';
    if (p >= 0 && c < 0) return 'bearish_cross';
    
    // Cek momentum (histogram membesar atau mengecil)
    if (c > 0 && c > p) return 'bullish_momentum';
    if (c < 0 && c < p) return 'bearish_momentum';
    
    return 'neutral';
  }
}
