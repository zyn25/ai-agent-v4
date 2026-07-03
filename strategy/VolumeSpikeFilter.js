export class VolumeSpikeFilter {
  #logger;
  constructor(logger) { this.#logger = logger; }

  check(volumes) {
    if (!volumes || volumes.length < 20) {
      return { valid: true, reason: 'Insufficient data', ratio: 1.0 };
    }

    const recent = volumes.slice(-20);
    const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const current = volumes[volumes.length - 1];
    const ratio = avg > 0 ? current / avg : 0;

    // FIX: Only block extremely low volume
    if (ratio < 0.3) {
      return { valid: false, reason: 'Volume too low (' + ratio.toFixed(2) + 'x avg)', ratio };
    }

    if (ratio >= 1.5) {
      return { valid: true, reason: 'High volume (' + ratio.toFixed(2) + 'x avg)', ratio, bonus: true };
    }

    return { valid: true, reason: 'Volume OK (' + ratio.toFixed(2) + 'x avg)', ratio };
  }
}
