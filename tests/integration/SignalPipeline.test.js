import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIndicator } from '../../strategy/indicators/EMA.js';
import { RSIIndicator } from '../../strategy/indicators/RSI.js';
import { MACDIndicator } from '../../strategy/indicators/MACD.js';
import { ATRIndicator } from '../../strategy/indicators/ATR.js';
import { VolumeIndicator } from '../../strategy/indicators/Volume.js';
import { TrendFilter } from '../../strategy/TrendFilter.js';
import { TrendStrength } from '../../strategy/TrendStrength.js';

describe('Integration: Signal Pipeline', () => {
  const closes = [];
  const highs = [];
  const lows = [];
  const volumes = [];
  for (let i = 0; i < 200; i++) {
    const price = 50000 + i * 30 + (Math.random() - 0.3) * 200;
    closes.push(price);
    highs.push(price + Math.random() * 300);
    lows.push(price - Math.random() * 300);
    volumes.push(100 + Math.random() * 200);
  }

  it('should calculate all indicators without error', () => {
    const emaFast = EMAIndicator.calculate(closes, 30);
    const emaSlow = EMAIndicator.calculate(closes, 100);
    const rsi = RSIIndicator.calculate(closes, 14);
    const macd = MACDIndicator.calculate(closes, 12, 26, 9);
    const atr = ATRIndicator.calculate(highs, lows, closes, 14);
    const vol = VolumeIndicator.calculate(volumes);

    assert.ok(emaFast.length > 0);
    assert.ok(emaSlow.length > 0);
    assert.ok(rsi.length > 0);
    assert.ok(atr.length > 0);
    assert.ok(vol.ratio > 0);
  });

  it('should detect bullish alignment in uptrend', () => {
    const emaFast = EMAIndicator.calculate(closes, 30);
    const emaSlow = EMAIndicator.calculate(closes, 100);
    const cross = EMAIndicator.crossover(emaFast, emaSlow);
    assert.ok(['bullish', 'above'].includes(cross));
  });

  it('should calculate positive score in uptrend', () => {
    const emaFast = EMAIndicator.calculate(closes, 30);
    const emaSlow = EMAIndicator.calculate(closes, 100);
    const ec = EMAIndicator.crossover(emaFast, emaSlow);
    const rv = RSIIndicator.calculate(closes, 14);
    const ri = RSIIndicator.interpret(rv[rv.length - 1], 70, 30);
    const mc = MACDIndicator.calculate(closes, 12, 26, 9);
    const mi = MACDIndicator.interpret(mc.MACD, mc.signal, mc.histogram);

    let score = 0;
    if (ec === 'bullish' || ec === 'above') score += 30;
    if (ri === 'bullish') score += 20;
    if (mi.includes('bullish')) score += 25;
    assert.ok(score > 0, 'Score should be positive in uptrend');
  });

  it('should detect trend strength', () => {
    const ts = new TrendStrength({}, { info: () => {}, error: () => {}, warn: () => {} });
    const result = ts.analyze(closes);
    assert.ok(result.strength > 0);
    assert.ok(typeof result.direction === 'string');
  });

  it('should filter by trend alignment', () => {
    assert.ok(TrendFilter.checkAlignment('bullish', 'bullish', 'bullish'));
    assert.ok(!TrendFilter.checkAlignment('bullish', 'bearish', 'bullish'));
  });
});
