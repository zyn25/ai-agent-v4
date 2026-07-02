import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test dynamic level calculations
function calculateLevels(entry, atr, side, slMult, tpMult) {
  const sl = side === 'long' ? entry - atr * slMult : entry + atr * slMult;
  const tp = side === 'long' ? entry + atr * tpMult : entry - atr * tpMult;
  const be = side === 'long' ? entry + atr * 0.3 : entry - atr * 0.3;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const rr = reward / risk;
  return { sl, tp, be, rr };
}

describe('Dynamic Levels Logic', () => {
  it('should calculate correct SL for long', () => {
    const { sl } = calculateLevels(50000, 500, 'long', 2, 5);
    assert.equal(sl, 49000);
  });

  it('should calculate correct TP for long', () => {
    const { tp } = calculateLevels(50000, 500, 'long', 2, 5);
    assert.equal(tp, 52500);
  });

  it('should calculate correct SL for short', () => {
    const { sl } = calculateLevels(50000, 500, 'short', 2, 5);
    assert.equal(sl, 51000);
  });

  it('should calculate correct TP for short', () => {
    const { tp } = calculateLevels(50000, 500, 'short', 2, 5);
    assert.equal(tp, 47500);
  });

  it('should have minimum 1:2 risk/reward', () => {
    const { rr } = calculateLevels(50000, 500, 'long', 2, 5);
    assert.ok(rr >= 2.0);
  });

  it('should calculate break even for long', () => {
    const { be } = calculateLevels(50000, 500, 'long', 2, 5);
    assert.ok(be > 50000);
  });

  it('should calculate break even for short', () => {
    const { be } = calculateLevels(50000, 500, 'short', 2, 5);
    assert.ok(be < 50000);
  });
});
