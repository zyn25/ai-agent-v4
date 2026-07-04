export class VolumeIndicator {
  /**
   * Menghitung statistik volume saat ini vs rata-rata.
   * @param {number[]} volumes - Array volume candle
   * @param {number} period - Periode rata-rata volume (default 20)
   * @returns {Object} Statistik volume
   */
  static calculate(volumes, period = 20) {
    // Guard 1: Cegah crash jika array kosong atau tidak valid
    if (!volumes || volumes.length < period) {
      return { average: 0, current: 0, ratio: 0 };
    }

    // Ambil 'period' data terakhir
    const s = volumes.slice(-period);
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    const cur = volumes[volumes.length - 1];

    // Guard 2: Cegah Infinity (Divide by Zero) jika avg = 0
    if (!avg || avg <= 0) {
      return { average: 0, current: cur, ratio: 0 };
    }

    return { average: avg, current: cur, ratio: cur / avg };
  }

  /**
   * Interpretasi rasio volume.
   * @param {number} r - Rasio (current / average)
   * @returns {'very_high'|'high'|'normal'|'low'} Status volume
   */
  static interpret(r) {
    // Guard: Cegah NaN / Infinity lolos ke perhitungan
    if (typeof r !== 'number' || isNaN(r) || !isFinite(r)) {
      return 'normal'; // Asumsikan normal jika data rusak, agar tidak menggangu SignalEngine
    }

    if (r >= 2) return 'very_high';
    if (r >= 1.5) return 'high';
    if (r >= 0.8) return 'normal';
    return 'low';
  }
}
