import { rsi } from 'technicalindicators';

export class RSIIndicator {
  /**
   * Menghitung nilai RSI dari array penutupan.
   * @param {number[]} closes - Array harga penutupan
   * @param {number} period - Periode RSI
   * @returns {number[]} Array nilai RSI
   */
  static calculate(closes, period) {
    // Guard: RSI butuh minimal 'period + 1' data untuk mulai menghitung
    if (!closes || closes.length < (period + 1)) {
      return [];
    }

    try {
      const result = rsi({ period, values: closes });
      return Array.isArray(result) ? result : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Interpretasi nilai RSI.
   * @param {number} v - Nilai RSI terakhir
   * @param {number} ob - Level Overbought (misal 70)
   * @param {number} os - Level Oversold (misal 30)
   * @returns {'overbought'|'oversold'|'bullish'|'bearish'|'neutral'} Status RSI
   */
  static interpret(v, ob, os) {
    // Guard: Cegah false-positive jika nilai v adalah NaN/undefined/null
    if (typeof v !== 'number' || isNaN(v)) {
      return 'neutral';
    }

    if (v >= ob) return 'overbought';
    if (v <= os) return 'oversold';
    
    return v >= 50 ? 'bullish' : 'bearish';
  }
}
