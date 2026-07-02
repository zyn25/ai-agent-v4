import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrderDeduplicator } from '../../trade/OrderDeduplicator.js';

describe('OrderDeduplicator', () => {
  const config = { risk: { cooldownMinutes: 30 } };
  const dedup = new OrderDeduplicator(config);

  it('should not block first order', () => {
    assert.equal(dedup.isDuplicate('BTC/USDT:USDT', 'long'), false);
  });

  it('should block duplicate order', () => {
    dedup.record('BTC/USDT:USDT', 'long');
    assert.equal(dedup.isDuplicate('BTC/USDT:USDT', 'long'), true);
  });

  it('should not block different pair', () => {
    dedup.record('BTC/USDT:USDT', 'long');
    assert.equal(dedup.isDuplicate('ETH/USDT:USDT', 'long'), false);
  });

  it('should not block different side', () => {
    dedup.record('BTC/USDT:USDT', 'long');
    assert.equal(dedup.isDuplicate('BTC/USDT:USDT', 'short'), false);
  });

  it('should track size', () => {
    const d = new OrderDeduplicator(config);
    assert.equal(d.size, 0);
    d.record('BTC/USDT:USDT', 'long');
    assert.equal(d.size, 1);
  });

  it('should return remaining time', () => {
    const d = new OrderDeduplicator(config);
    d.record('BTC/USDT:USDT', 'long');
    const remaining = d.timeUntilAllowed('BTC/USDT:USDT', 'long');
    assert.ok(remaining > 0);
  });
});
