import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIndicator } from '../../strategy/indicators/EMA.js';
describe('EMAIndicator', () => {
  const c = [44,44.34,44.09,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64,46.21,46.25,45.71,46.45,45.78,45.35,44.03,44.18,44.22,44.57];
  it('calculate EMA', () => { const r = EMAIndicator.calculate(c, 10); assert.ok(r.length > 0); });
  it('correct length', () => { assert.equal(EMAIndicator.calculate(c, 10).length, c.length - 10 + 1); });
  it('bullish crossover', () => { assert.equal(EMAIndicator.crossover([10,11,12,13,14], [11,11.5,12,12.5,13]), 'above'); });
  it('bearish', () => { assert.equal(EMAIndicator.crossover([14,13,12,11,10], [13,12.5,12,11.5,11]), 'below'); });
  it('neutral insufficient', () => { assert.equal(EMAIndicator.crossover([10], [10]), 'neutral'); });
});
