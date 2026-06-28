import 'dotenv/config';
import { Config } from '../config/index.js';
import { ExchangeFactory } from '../exchange/ExchangeFactory.js';
import { Optimizer } from './Optimizer.js';

const config = new Config();
const logger = { info: console.log, error: console.error, warn: console.warn };

const pair = process.argv[2] || config.exchange.pair;
const days = parseInt(process.argv[3]) || 30;
const tf = process.argv[4] || '15m';

console.log('=== AI AGENT V4 OPTIMIZER ===');
console.log('Pair: ' + pair);
console.log('Timeframe: ' + tf);
console.log('Period: ' + days + ' days');
console.log('');

const factory = new ExchangeFactory(config, logger);
const exchange = await factory.create();

const optimizer = new Optimizer(config);
const results = await optimizer.gridSearch(exchange, pair, tf, days);

if (!results.length) {
  console.log('No profitable configurations found.');
  process.exit(0);
}

console.log('');
console.log('=== TOP 10 CONFIGURATIONS ===');
console.log('');

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  console.log('#' + (i + 1) + ' Score: ' + r.score.toFixed(2));
  console.log('   EMA: ' + r.params.emaFast + '/' + r.params.emaSlow);
  console.log('   ATR SL: ' + r.params.atrSl + 'x | TP: ' + r.params.atrTp + 'x');
  console.log('   Confidence: ' + r.params.confidence + '%');
  console.log('   Trades: ' + r.trades + ' | WR: ' + r.winRate.toFixed(1) + '%');
  console.log('   PnL: $' + r.totalPnl.toFixed(2) + ' | PF: ' + r.profitFactor.toFixed(2));
  console.log('   Max DD: ' + r.maxDrawdown.toFixed(2) + '%');
  console.log('   End Balance: $' + r.endBalance);
  console.log('');
}

const best = results[0];
console.log('=== BEST CONFIG ===');
console.log('EMA_FAST=' + best.params.emaFast);
console.log('EMA_SLOW=' + best.params.emaSlow);
console.log('ATR_SL_MULTIPLIER=' + best.params.atrSl);
console.log('ATR_TP_MULTIPLIER=' + best.params.atrTp);
console.log('SIGNAL_CONFIDENCE_THRESHOLD=' + best.params.confidence);

process.exit(0);
