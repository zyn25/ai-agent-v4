export class TrendFilter {
  /**
   * Mengecek apakah tren dari 3 timeframe sudah searah (selaras).
   * Aturan: Primary adalah Raja. Secondary dan Tertiary tidak boleh berlawanan arah dengan Primary.
   * 
   * @param {string} p - Tren Primary Timeframe (e.g., 'bullish', 'bearish', 'neutral')
   * @param {string} s - Tren Secondary Timeframe
   * @param {string} t - Tren Tertiary Timeframe
   * @returns {boolean} True jika selaras, false jika tidak.
   */
  static checkAlignment(p, s, t) {
    // Guard: Cegah error jika ada trend yang undefined/null
    if (!p || !s || !t) return false;

    // Primary harus jelas arahnya (bullish atau bearish)
    // Jika Primary sideways/neutral, jangan trading.
    if (p === 'neutral') return false;

    // Jika Primary BULLISH:
    // Secondary dan Tertiary TIDAK BOLEH BEARISH.
    // (Mereka boleh bullish atau neutral)
    if (p === 'bullish') {
      return s !== 'bearish' && t !== 'bearish';
    }

    // Jika Primary BEARISH:
    // Secondary dan Tertiary TIDAK BOLEH BULLISH.
    // (Mereka boleh bearish atau neutral)
    if (p === 'bearish') {
      return s !== 'bullish' && t !== 'bullish';
    }

    // Fallback jika ada anomali string
    return false;
  }
}
