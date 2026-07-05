import 'dotenv/config';
import { Config } from '../config/index.js';
import { ExchangeFactory } from '../exchange/ExchangeFactory.js';
import { BacktestEngine } from './BacktestEngine.js';

const config = new Config();
const logger = { info: console.log, error: console.error, warn: console.warn };
const factory = new ExchangeFactory(config, logger);
const exchange = await factory.create();

const pairs = [
  'DOGE/USDT:USDT',
  'LINK/USDT:USDT',
  'ARB/USDT:USDT',
  'OP/USDT:USDT',
  'NEAR/USDT:USDT',
  'SUI/USDT:USDT',
];

console.log('=== BACKTEST NEW PAIRS (1h, 30 days) ===\n');

for (const pair of pairs) {
  const engine = new BacktestEngine(config);
  const result = await engine.run(exchange, pair, '1h', 30);

  if (result.error) {
    console.log(pair + ': Error - ' + result.error);
    continue;
  }

  const status = parseFloat(result.profitFactor) >= 1.0 ? '✅' : '❌';
  console.log(status + ' ' + pair + ':');
  console.log('   Trades: ' + result.totalTrades + ' | WR: ' + result.winRate + '%');
  console.log('   PnL: $' + result.totalPnl + ' | PF: ' + result.profitFactor);
  console.log('   DD: ' + result.maxDrawdown + '% | End: $' + result.endBalance);
  console.log('');
}

process.exit(0);
