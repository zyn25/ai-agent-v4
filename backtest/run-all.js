import 'dotenv/config';
import { Config } from '../config/index.js';
import { ExchangeFactory } from '../exchange/ExchangeFactory.js';
import { BacktestEngine } from './BacktestEngine.js';

const config = new Config();
const logger = { info: console.log, error: console.error, warn: console.warn };
const factory = new ExchangeFactory(config, logger);
const exchange = await factory.create();

const pairs = ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT'];
const timeframes = ['15m', '1h'];
const days = 30;

console.log('=== BACKTEST ALL PAIRS ===\n');

for (const pair of pairs) {
  for (const tf of timeframes) {
    console.log(`--- ${pair} ${tf} ---`);
    const engine = new BacktestEngine(config);
    const result = await engine.run(exchange, pair, tf, days);

    if (result.error) {
      console.log('  Error:', result.error);
      continue;
    }

    console.log(`  Trades: ${result.totalTrades}`);
    console.log(`  Win Rate: ${result.winRate}%`);
    console.log(`  PnL: $${result.totalPnl}`);
    console.log(`  Profit Factor: ${result.profitFactor}`);
    console.log(`  Max DD: ${result.maxDrawdown}%`);
    console.log(`  End Balance: $${result.endBalance}`);
    console.log('');
  }
}

process.exit(0);
