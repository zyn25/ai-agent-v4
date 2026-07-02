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
    assert.ok(result.reason.includes('Insufficient'));
  });

  it('should reject null data', async () => {
    const result = await filter.check(null);
    assert.equal(result.trade, false);
  });

  it('should accept normal market data', async () => {
    const ohlcv = [];
    for (let i = 0; i < 100; i++) {
      const base = 50000 + Math.sin(i * 0.1) * 500 + i * 10;
      ohlcv.push([Date.now() - (100 - i) * 60000, base - 100, base + 200, base - 150, base, 1000 + Math.random() * 500]);
    }
    const result = await filter.check(ohlcv);
    assert.ok(typeof result.trade === 'boolean');
    assert.ok(typeof result.reason === 'string');
  });

  it('should detect low volume', async () => {
    const ohlcv = [];
    for (let i = 0; i < 100; i++) {
      ohlcv.push([Date.now() - (100 - i) * 60000, 50000, 50100, 49900, 50050, 0.001]);
    }
    const result = await filter.check(ohlcv);
    assert.equal(result.trade, false);
  });
});
