import { atr } from 'technicalindicators';

export class ATRIndicator {
  /**
   * Menghitung nilai Average True Range (ATR).
   * @param {number[]} highs - Array harga tertinggi
   * @param {number[]} lows - Array harga terendah
   * @param {number[]} closes - Array harga penutupan
   * @param {number} period - Periode ATR
   * @returns {number[]} Array nilai ATR
   */
  static calculate(highs, lows, closes, period) {
    // Guard: Pastikan semua input valid dan cukup untuk dihitung
    if (!highs || !lows || !closes || highs.length < period || lows.length < period || closes.length < period) {
      return [];
    }

    try {
      const result = atr({ high: highs, low: lows, close: closes, period });
      
      // Library technicalindicators kadang mereturn []
      if (!result || result.length === 0) return [];
      
      // ATR membutuhkan data pertama sebagai inisialisasi, 
      // sehingga array result biasanya mulai dari index ke-(period-1)
      return Array.isArray(result) ? result : [];
    } catch (e) {
      // Kalau ada error (misal NaN di dalam array), kembalikan array kosong
      // agar tidak crash di SignalEngine
      return [];
    }
  }
}
