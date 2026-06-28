import 'dotenv/config';
import { Config } from '../config/index.js';
import { ExchangeFactory } from '../exchange/ExchangeFactory.js';
import { BacktestEngine } from './BacktestEngine.js';

const config = new Config();
const logger = { info: console.log, error: console.error, warn: console.warn };

const pair = process.argv[2] || config.exchange.pair;
const days = parseInt(process.argv[3]) || 30;
const tf = process.argv[4] || '15m';

console.log('=== AI AGENT V4 BACKTEST ===');
console.log('Pair: ' + pair);
console.log('Timeframe: ' + tf);
console.log('Period: ' + days + ' days');
console.log('Balance: $' + config.trading.startingBalance);
console.log('');

const factory = new ExchangeFactory(config, logger);
const exchange = await factory.create();

const engine = new BacktestEngine(config);
const result = await engine.run(exchange, pair, tf, days);

if (result.error) {
  console.error('Error:', result.error);
  process.exit(1);
}

console.log('');
console.log('=== RESULTS ===');
console.log('Total Trades: ' + result.totalTrades);
console.log('Wins: ' + result.wins + ' | Losses: ' + result.losses);
console.log('Win Rate: ' + result.winRate + '%');
console.log('Total PnL: $' + result.totalPnl);
console.log('ROI: ' + result.roi + '%');
console.log('Profit Factor: ' + result.profitFactor);
console.log('Max Drawdown: ' + result.maxDrawdown + '%');
console.log('Max Consec Wins: ' + result.maxConsecWins);
console.log('Max Consec Losses: ' + result.maxConsecLosses);
console.log('Avg Win: $' + result.avgWin);
console.log('Avg Loss: $' + result.avgLoss);
console.log('Expectancy: $' + result.expectancy);
console.log('Start: $' + result.startBalance);
console.log('End: $' + result.endBalance);
console.log('Peak: $' + result.peakBalance);
console.log('');

if (result.trades.length > 0) {
  console.log('=== LAST 20 TRADES ===');
  for (const t of result.trades) {
    const e = t.pnl > 0 ? 'WIN' : 'LOSS';
    console.log(e + ' ' + t.side.toUpperCase() + ' Entry:' + t.entry.toFixed(2) + ' Exit:' + t.exit.toFixed(2) + ' PnL:$' + t.pnl.toFixed(2) + ' ' + t.reason);
  }
}

process.exit(0);
