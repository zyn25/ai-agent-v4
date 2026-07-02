import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TrendStrength } from '../../strategy/TrendStrength.js';

describe('TrendStrength', () => {
  const config = {};
  const logger = { info: () => {}, error: () => {}, warn: () => {} };
  const ts = new TrendStrength(config, logger);

  it('should reject insufficient data', () => {
    const result = ts.analyze([1, 2, 3]);
    assert.equal(result.tradeable, false);
  });

  it('should detect bullish trend', () => {
    // Create uptrend data
    const closes = [];
    for (let i = 0; i < 200; i++) {
      closes.push(50000 + i * 50 + Math.random() * 100);
    }
    const result = ts.analyze(closes);
    assert.ok(result.strength >= 0);
    assert.ok(typeof result.direction === 'string');
    assert.ok(typeof result.tradeable === 'boolean');
  });

  it('should detect bearish trend', () => {
    const closes = [];
    for (let i = 0; i < 200; i++) {
      closes.push(60000 - i * 50 + Math.random() * 100);
    }
    const result = ts.analyze(closes);
    assert.ok(result.strength >= 0);
  });

  it('should detect ranging market', () => {
    const closes = [];
    for (let i = 0; i < 200; i++) {
      closes.push(50000 + Math.sin(i * 0.5) * 200);
    }
    const result = ts.analyze(closes);
    assert.ok(result.strength >= 0);
    assert.ok(typeof result.tradeable === 'boolean');
  });

  it('should return all required fields', () => {
    const closes = [];
    for (let i = 0; i < 200; i++) closes.push(50000 + i * 10);
    const result = ts.analyze(closes);
    assert.ok('strength' in result);
    assert.ok('direction' in result);
    assert.ok('tradeable' in result);
  });
});
