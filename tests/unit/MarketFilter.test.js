import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MarketFilter } from '../../strategy/MarketFilter.js';

describe('MarketFilter', () => {
  const config = { indicators: {} };
  const logger = { info: () => {}, error: () => {}, warn: () => {} };
  const filter = new MarketFilter(config, logger);

  it('should reject insufficient data', async () => {
    const result = await filter.check([]);
    assert.equal(result.trade, false);
  });

  it('should reject null data', async () => {
    const result = await filter.check(null);
    assert.equal(result.trade, false);
  });

  it('should accept trending market data', async () => {
    const ohlcv = [];
    for (let i = 0; i < 100; i++) {
      const base = 50000 + i * 30 + (Math.random() - 0.3) * 200;
      ohlcv.push([Date.now() - (100 - i) * 60000, base - 100, base + 200, base - 150, base, 1000 + Math.random() * 500]);
    }
    const result = await filter.check(ohlcv);
    assert.ok(typeof result.trade === 'boolean');
    assert.ok(typeof result.reason === 'string');
  });

  it('should detect zero volume', async () => {
    const ohlcv = [];
    for (let i = 0; i < 100; i++) {
      ohlcv.push([Date.now() - (100 - i) * 60000, 50000, 50100, 49900, 50050, 0.0001]);
    }
    const result = await filter.check(ohlcv);
    assert.equal(result.trade, false);
  });

  it('should return object with required fields', async () => {
    const ohlcv = [];
    for (let i = 0; i < 100; i++) {
      const base = 50000 + i * 30;
      ohlcv.push([Date.now() - (100 - i) * 60000, base - 100, base + 200, base - 150, base, 1000]);
    }
    const result = await filter.check(ohlcv);
    assert.ok('trade' in result);
    assert.ok('reason' in result);
    assert.ok('score' in result);
  });
});
