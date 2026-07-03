import 'dotenv/config';
import { Config } from '../config/index.js';
import { ExchangeFactory } from '../exchange/ExchangeFactory.js';
import { BacktestEngine } from './BacktestEngine.js';

const config = new Config();
const logger = { info: console.log, error: console.error, warn: console.warn };
const factory = new ExchangeFactory(config, logger);
const exchange = await factory.create();

const pairs = ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT'];
const days = 30;

console.log('=== BACKTEST (1h timeframe, balanced mode) ===\n');

for (const pair of pairs) {
  const engine = new BacktestEngine(config);
  const result = await engine.run(exchange, pair, '1h', days);

  if (result.error) {
    console.log(pair + ': Error - ' + result.error);
    continue;
  }

  console.log(pair + ':');
  console.log('  Trades: ' + result.totalTrades + ' | WR: ' + result.winRate + '%');
  console.log('  PnL: $' + result.totalPnl + ' | PF: ' + result.profitFactor);
  console.log('  DD: ' + result.maxDrawdown + '% | End: $' + result.endBalance);
  console.log('');
}

process.exit(0);
