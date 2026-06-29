/**
 * Position scaling (scale in/out).
 * Allows adding to winning positions and reducing losers.
 */
export class PositionScaler {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  /**
   * Check if we should scale into a position
   * @param {object} position - Current position
   * @param {number} currentPrice - Current market price
   * @returns { object } Scale recommendation
   */
  shouldScaleIn(position, currentPrice) {
    const pnl = this.#calculatePnlPercent(position, currentPrice);

    // Only scale into winners
    if (pnl <= 0) return { scale: false, reason: 'Position in loss' };

    // Scale in at 1R profit
    if (pnl >= 1.0 && position.scale_count < 1) {
      return {
        scale: true,
        type: 'scale_in',
        sizePercent: 50,
        reason: 'Scale in at 1R profit'
      };
    }

    return { scale: false, reason: 'No scale trigger' };
  }

  /**
   * Check if we should scale out of a position
   */
  shouldScaleOut(position, currentPrice) {
    const pnl = this.#calculatePnlPercent(position, currentPrice);

    // Scale out if losing more than 1.5R
    if (pnl <= -1.5 && !position.scaled_out) {
      return {
        scale: true,
        type: 'scale_out',
        sizePercent: 50,
        reason: 'Scale out at -1.5R loss'
      };
    }

    return { scale: false, reason: 'No scale trigger' };
  }

  #calculatePnlPercent(position, currentPrice) {
    if (!position.entry_price || position.entry_price === 0) return 0;
    const distance = position.side === 'long'
      ? currentPrice - position.entry_price
      : position.entry_price - currentPrice;
    return distance / position.entry_price * 100;
  }
}
