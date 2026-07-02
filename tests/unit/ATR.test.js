import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ATRIndicator } from '../../strategy/indicators/ATR.js';
describe('ATRIndicator', () => {
  const h = [48.70,48.72,48.90,48.87,48.82,49.05,49.20,49.35,49.92,50.19,50.12,49.66,49.88,50.19,50.36,49.68,50.13,50.63,50.30,49.69,50.13,50.52,49.79,50.13,49.59,49.31,48.69,48.90,48.81,48.81];
  const l = [47.80,48.14,48.39,48.37,48.24,48.64,48.94,48.86,49.50,49.87,49.20,48.90,49.43,49.73,49.26,48.98,49.55,49.96,49.47,49.06,49.39,49.51,48.92,49.50,48.91,48.52,47.90,48.20,48.10,48.31];
  const c = [48.16,48.61,48.75,48.63,48.74,49.03,49.07,49.32,49.91,50.13,49.53,49.50,49.75,50.03,49.61,49.26,50.09,50.39,49.60,49.56,49.91,50.01,49.20,49.81,49.06,48.66,48.09,48.65,48.37,48.53];
  it('calculate ATR', () => { assert.ok(ATRIndicator.calculate(h, l, c, 14).length > 0); });
  it('positive values', () => { for (const v of ATRIndicator.calculate(h, l, c, 14)) assert.ok(v > 0); });
  it('correct length', () => { const r = ATRIndicator.calculate(h, l, c, 14); assert.ok(r.length >= h.length - 14); });
});
