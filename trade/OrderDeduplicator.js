/**
 * Prevents duplicate orders.
 * Required by master prompt: "Never send duplicate orders"
 */
export class OrderDeduplicator {
  #recentOrders = new Map();
  #cooldownMs;

  constructor(config) {
    this.#cooldownMs = (config.risk?.cooldownMinutes || 30) * 60000;
  }

  /**
   * Check if this order is a duplicate
   * @returns {boolean} true if duplicate (should block)
   */
  isDuplicate(pair, side) {
    const key = pair + '_' + side;
    const lastOrder = this.#recentOrders.get(key);

    if (!lastOrder) return false;

    const elapsed = Date.now() - lastOrder;
    if (elapsed < this.#cooldownMs) {
      return true;
    }

    return false;
  }

  /**
   * Record an order
   */
  record(pair, side) {
    const key = pair + '_' + side;
    this.#recentOrders.set(key, Date.now());
    this.#cleanup();
  }

  /**
   * Get time until next allowed order
   */
  timeUntilAllowed(pair, side) {
    const key = pair + '_' + side;
    const lastOrder = this.#recentOrders.get(key);
    if (!lastOrder) return 0;

    const elapsed = Date.now() - lastOrder;
    const remaining = this.#cooldownMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  #cleanup() {
    const now = Date.now();
    for (const [key, time] of this.#recentOrders) {
      if (now - time > this.#cooldownMs * 2) {
        this.#recentOrders.delete(key);
      }
    }
  }

  get size() { return this.#recentOrders.size; }
}
