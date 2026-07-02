/**
 * Volume profile analysis.
 * Identifies high-volume price levels (support/resistance).
 */
export class VolumeProfile {
  #logger;
  constructor(logger) { this.#logger = logger; }

  /**
   * Analyze volume profile
   * @param {Array} closes - Close prices
   * @param {Array} volumes - Volume data
   * @param {number} bins - Number of price bins
   * @returns {object} Volume profile analysis
   */
  analyze(closes, volumes, bins = 20) {
    if (!closes || closes.length < 50) return null;

    const minPrice = Math.min(...closes.slice(-100));
    const maxPrice = Math.max(...closes.slice(-100));
    const binSize = (maxPrice - minPrice) / bins;

    if (binSize <= 0) return null;

    // Create volume profile
    const profile = new Array(bins).fill(0);
    const recent = closes.slice(-100);
    const recentVol = volumes.slice(-100);

    for (let i = 0; i < recent.length; i++) {
      const binIndex = Math.min(Math.floor((recent[i] - minPrice) / binSize), bins - 1);
      profile[binIndex] += recentVol[i] || 0;
    }

    // Find high volume nodes (HVN) and low volume nodes (LVN)
    const avgVolume = profile.reduce((s, v) => s + v, 0) / bins;
    const hvn = []; // High volume = support/resistance
    const lvn = []; // Low volume = breakout zones

    for (let i = 0; i < bins; i++) {
      const priceLevel = minPrice + (i + 0.5) * binSize;
      if (profile[i] > avgVolume * 1.5) {
        hvn.push({ price: priceLevel, volume: profile[i], type: 'hvn' });
      } else if (profile[i] < avgVolume * 0.5) {
        lvn.push({ price: priceLevel, volume: profile[i], type: 'lvn' });
      }
    }

    // Point of Control (POC) - highest volume level
    const pocIndex = profile.indexOf(Math.max(...profile));
    const poc = minPrice + (pocIndex + 0.5) * binSize;

    const currentPrice = closes[closes.length - 1];

    return {
      poc,
      pocDistance: ((currentPrice - poc) / currentPrice * 100).toFixed(2) + '%',
      hvn: hvn.slice(0, 5),
      lvn: lvn.slice(0, 5),
      abovePoc: currentPrice > poc,
      nearPoc: Math.abs((currentPrice - poc) / currentPrice) < 0.01,
    };
  }
}
