/**
 * Price alert system.
 * Monitors price levels and sends Telegram alerts.
 */
export class PriceAlert {
  #config; #logger; #db; #telegram; #exchange; #interval;
  #alerts; #lastCheck;

  constructor(config, logger, db, telegram, exchange) {
    this.#config = config;
    this.#logger = logger;
    this.#db = db;
    this.#telegram = telegram;
    this.#exchange = exchange;
    this.#alerts = new Map();
    this.#lastCheck = {};
  }

  start() {
    this.#interval = setInterval(() => this.#check(), 30000);
    this.#logger.info('Price alert system started');
  }

  /**
   * Add a price alert
   */
  addAlert(pair, price, direction, message) {
    const id = 'alert_' + Date.now();
    this.#alerts.set(id, { pair, price, direction, message, triggered: false });
    this.#logger.info('Alert added: ' + pair + ' ' + direction + ' ' + price);
    return id;
  }

  /**
   * Remove an alert
   */
  removeAlert(id) {
    this.#alerts.delete(id);
  }

  /**
   * Get all alerts
   */
  getAlerts() {
    return Array.from(this.#alerts.entries()).map(([id, a]) => ({ id, ...a }));
  }

  async #check() {
    for (const [id, alert] of this.#alerts) {
      if (alert.triggered) continue;

      try {
        const ticker = await this.#exchange.fetchTicker(alert.pair);
        const price = ticker.last;

        if (alert.direction === 'above' && price >= alert.price) {
          alert.triggered = true;
          await this.#telegram.sendAlert(
            '🎯 <b>PRICE ALERT</b>\n\n' +
            'Pair: ' + alert.pair + '\n' +
            'Price: $' + price.toFixed(2) + '\n' +
            'Target: $' + alert.price.toFixed(2) + ' (above)\n' +
            (alert.message ? 'Note: ' + alert.message : '')
          );
        }

        if (alert.direction === 'below' && price <= alert.price) {
          alert.triggered = true;
          await this.#telegram.sendAlert(
            '🎯 <b>PRICE ALERT</b>\n\n' +
            'Pair: ' + alert.pair + '\n' +
            'Price: $' + price.toFixed(2) + '\n' +
            'Target: $' + alert.price.toFixed(2) + ' (below)\n' +
            (alert.message ? 'Note: ' + alert.message : '')
          );
        }
      } catch (e) {
        // Silent fail
      }
    }
  }

  stop() {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
  }
}
