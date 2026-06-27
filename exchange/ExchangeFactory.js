import ccxt from 'ccxt';

const EXCHANGES = { binance: ccxt.binance, kucoin: ccxt.kucoinfutures };

export class ExchangeFactory {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  async create() {
    const { name, apiKey, secret, password, testnet } = this.#config.exchange;
    const Ex = EXCHANGES[name];
    if (!Ex) throw new Error(`Unsupported exchange: ${name}`);

    const opts = {
      apiKey: apiKey || undefined,
      secret: secret || undefined,
      enableRateLimit: true,
      options: { defaultType: 'swap' }
    };
    if (password) opts.password = password;

    const exchange = new Ex(opts);

    if (testnet) {
      exchange.setSandboxMode(true);
      this.#logger.info('Exchange running in TESTNET mode');
    }

    if (!apiKey) {
      this.#logger.warn('No API key - public data only (paper trading mode)');
    }

    await exchange.loadMarkets();
    this.#logger.info(`Exchange ${name} connected. Markets loaded.`);
    return exchange;
  }
}
