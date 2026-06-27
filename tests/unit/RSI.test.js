import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RSIIndicator } from '../../strategy/indicators/RSI.js';
describe('RSIIndicator', () => {
  const c = [44,44.34,44.09,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64,46.21,46.25,45.71,46.45,45.78,45.35,44.03,44.18,44.22,44.57];
  it('calculate RSI', () => { assert.ok(RSIIndicator.calculate(c, 14).length > 0); });
  it('values 0-100', () => { for (const v of RSIIndicator.calculate(c, 14)) assert.ok(v >= 0 && v <= 100); });
  it('overbought', () => { assert.equal(RSIIndicator.interpret(75, 70, 30), 'overbought'); });
  it('oversold', () => { assert.equal(RSIIndicator.interpret(25, 70, 30), 'oversold'); });
  it('bullish', () => { assert.equal(RSIIndicator.interpret(55, 70, 30), 'bullish'); });
  it('bearish', () => { assert.equal(RSIIndicator.interpret(45, 70, 30), 'bearish'); });
  it('boundary', () => { assert.equal(RSIIndicator.interpret(70, 70, 30), 'overbought'); assert.equal(RSIIndicator.interpret(30, 70, 30), 'oversold'); });
});
