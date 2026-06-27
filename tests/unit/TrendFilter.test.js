import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TrendFilter } from '../../strategy/TrendFilter.js';
describe('TrendFilter', () => {
  it('align bullish', () => { assert.ok(TrendFilter.checkAlignment('bullish','bullish','bullish')); });
  it('align bearish', () => { assert.ok(TrendFilter.checkAlignment('bearish','bearish','bearish')); });
  it('align with neutral secondary', () => { assert.ok(TrendFilter.checkAlignment('bullish','neutral','bullish')); });
  it('align with both neutral', () => { assert.ok(TrendFilter.checkAlignment('bullish','neutral','neutral')); });
  it('reject neutral primary', () => { assert.ok(!TrendFilter.checkAlignment('neutral','bullish','bullish')); });
  it('reject conflicting', () => { assert.ok(!TrendFilter.checkAlignment('bullish','bearish','bullish')); });
  it('reject bearish vs bullish', () => { assert.ok(!TrendFilter.checkAlignment('bearish','bullish','bearish')); });
  it('reject all neutral', () => { assert.ok(!TrendFilter.checkAlignment('neutral','neutral','neutral')); });
});
