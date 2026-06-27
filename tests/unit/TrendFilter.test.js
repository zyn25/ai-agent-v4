import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TrendFilter } from '../../strategy/TrendFilter.js';
describe('TrendFilter', () => {
  it('align bullish', () => { assert.ok(TrendFilter.checkAlignment('bullish','bullish','bullish')); });
  it('reject conflicting', () => { assert.ok(!TrendFilter.checkAlignment('bullish','bearish','bullish')); });
});
