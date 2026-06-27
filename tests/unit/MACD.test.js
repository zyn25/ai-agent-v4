import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MACDIndicator } from '../../strategy/indicators/MACD.js';
describe('MACDIndicator', () => {
  const c = [44,44.34,44.09,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64,46.21,46.25,45.71,46.45,45.78,45.35,44.03,44.18,44.22,44.57,43.42,42.66,43.13,44.08,44.15,44.60];
  it('calculate MACD', () => { const r = MACDIndicator.calculate(c, 12, 26, 9); assert.ok(r.MACD); assert.ok(r.signal); assert.ok(r.histogram); });
  it('bullish cross', () => { assert.equal(MACDIndicator.interpret(null, null, [-1, -0.5, 0.5]), 'bullish_cross'); });
  it('bearish cross', () => { assert.equal(MACDIndicator.interpret(null, null, [1, 0.5, -0.5]), 'bearish_cross'); });
  it('bullish momentum', () => { assert.equal(MACDIndicator.interpret(null, null, [0.5, 1.0, 1.5]), 'bullish_momentum'); });
  it('bearish momentum', () => { assert.equal(MACDIndicator.interpret(null, null, [-0.5, -1.0, -1.5]), 'bearish_momentum'); });
  it('neutral', () => { assert.equal(MACDIndicator.interpret(null, null, null), 'neutral'); assert.equal(MACDIndicator.interpret(null, null, [1]), 'neutral'); });
});
