import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PositionSizer } from '../../risk/PositionSizer.js';
describe('PositionSizer', () => {
  const config = { risk: { riskPerTrade: 1 }, exchange: { leverage: 10 } };
  it('calculate correct size', () => {
    const r = new PositionSizer(config).calculate(10000, 50000, 49000);
    assert.ok(r.quantity > 0);
    assert.equal(r.riskPercent, 1);
    assert.equal(r.leverage, 10);
  });
  it('return zero for zero stop', () => {
    const r = new PositionSizer(config).calculate(10000, 50000, 50000);
    assert.equal(r.quantity, 0);
  });
  it('respect risk percentage', () => {
    const r = new PositionSizer(config).calculate(10000, 50000, 49000);
    assert.ok(r.riskAmount <= 100);
  });
  it('scale with balance', () => {
    const s = new PositionSizer(config);
    const r1 = s.calculate(10000, 50000, 49000);
    const r2 = s.calculate(20000, 50000, 49000);
    assert.ok(r2.quantity > r1.quantity);
  });
  it('handle small balance', () => {
    const r = new PositionSizer(config).calculate(10, 50000, 49000);
    assert.ok(r.quantity >= 0);
  });
  it('calculate margin correctly', () => {
    const r = new PositionSizer(config).calculate(10000, 50000, 49000);
    const expected = r.positionValue / r.leverage;
    assert.ok(Math.abs(r.marginRequired - expected) < 1);
  });
});
