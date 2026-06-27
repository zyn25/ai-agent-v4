import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VolumeIndicator } from '../../strategy/indicators/Volume.js';
describe('VolumeIndicator', () => {
  it('calculate', () => { const r = VolumeIndicator.calculate([100,120,80,150,90]); assert.ok(r.average > 0); assert.ok(r.ratio > 0); });
  it('very high', () => { assert.equal(VolumeIndicator.interpret(2.5), 'very_high'); });
  it('high', () => { assert.equal(VolumeIndicator.interpret(1.5), 'high'); });
  it('normal', () => { assert.equal(VolumeIndicator.interpret(1.0), 'normal'); });
  it('low', () => { assert.equal(VolumeIndicator.interpret(0.5), 'low'); });
  it('correct average', () => { assert.equal(VolumeIndicator.calculate([10,20,30,40,50], 5).average, 30); });
  it('correct ratio', () => { const r = VolumeIndicator.calculate([10,20,30,40,60], 5); assert.equal(r.ratio, 60/32); });
});
