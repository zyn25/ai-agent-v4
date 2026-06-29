import 'dotenv/config';
import { Config } from './config/index.js';
import { ExchangeFactory } from './exchange/ExchangeFactory.js';
import { EMAIndicator } from './strategy/indicators/EMA.js';
import { RSIIndicator } from './strategy/indicators/RSI.js';
import { MACDIndicator } from './strategy/indicators/MACD.js';
import { ATRIndicator } from './strategy/indicators/ATR.js';
import { VolumeIndicator } from './strategy/indicators/Volume.js';

const config = new Config();
const logger = { info: console.log, error: console.error, warn: console.warn };
const factory = new ExchangeFactory(config, logger);
const exchange = await factory.create();

for (const pair of ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT']) {
  console.log('\n=== ' + pair + ' ===');
  for (const tf of ['15m', '1h', '4h']) {
    const ohlcv = await exchange.fetchOHLCV(pair, tf, undefined, 200);
    const closes = ohlcv.map(c => c[4]);
    const highs = ohlcv.map(c => c[2]);
    const lows = ohlcv.map(c => c[3]);
    const volumes = ohlcv.map(c => c[5]);
    
    const ind = config.indicators;
    const ef = EMAIndicator.calculate(closes, ind.emaFast);
    const es = EMAIndicator.calculate(closes, ind.emaSlow);
    const ec = EMAIndicator.crossover(ef, es);
    const rv = RSIIndicator.calculate(closes, ind.rsiPeriod);
    const ri = RSIIndicator.interpret(rv[rv.length-1], ind.rsiOverbought, ind.rsiOversold);
    const mc = MACDIndicator.calculate(closes, ind.macdFast, ind.macdSlow, ind.macdSignal);
    const mi = mc.histogram ? MACDIndicator.interpret(mc.MACD, mc.signal, mc.histogram) : 'neutral';
    const av = ATRIndicator.calculate(highs, lows, closes, ind.atrPeriod);
    const vd = VolumeIndicator.calculate(volumes);
    
    let score = 0;
    if (ec==='bullish'||ec==='above') score+=50*0.3; else if (ec==='bearish'||ec==='below') score-=50*0.3;
    if (ri==='bullish') score+=50*0.2; else if (ri==='bearish') score-=50*0.2;
    if (mi.includes('bullish')) score+=50*0.25; else if (mi.includes('bearish')) score-=50*0.25;
    
    console.log('  ' + tf + ': EMA=' + ec + ' | RSI=' + rv[rv.length-1]?.toFixed(1) + ' (' + ri + ') | MACD=' + mi + ' | Score=' + score.toFixed(1));
  }
}

process.exit(0);
