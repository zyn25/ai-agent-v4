import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VolumeIndicator } from '../../strategy/indicators/Volume.js';

describe('VolumeIndicator', () => {
  it('should calculate volume data', () => {
    const r = VolumeIndicator.calculate([100, 120, 80, 150, 90, 110, 130, 100, 95, 105, 115, 85, 125, 95, 105, 110, 90, 120, 100, 130]);
    assert.ok(r.average > 0);
    assert.ok(r.ratio > 0);
  });

  it('should interpret very high volume', () => {
    assert.equal(VolumeIndicator.interpret(2.5), 'very_high');
  });

  it('should interpret high volume', () => {
    assert.equal(VolumeIndicator.interpret(1.5), 'high');
  });

  it('should interpret normal volume', () => {
    assert.equal(VolumeIndicator.interpret(1.0), 'normal');
  });

  it('should interpret low volume', () => {
    assert.equal(VolumeIndicator.interpret(0.5), 'low');
  });

  it('should calculate correct average', () => {
    const r = VolumeIndicator.calculate([10, 20, 30, 40, 50], 5);
    assert.equal(r.average, 30);
  });

  it('should handle single value', () => {
    const r = VolumeIndicator.calculate([100]);
    assert.ok(r.ratio >= 0);
  });
});
