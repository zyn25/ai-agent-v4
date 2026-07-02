import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test streak logic without database
function calculateStreak(trades) {
  let winStreak = 0, lossStreak = 0;
  for (const t of trades) {
    if (t.pnl > 0) { winStreak++; lossStreak = 0; }
    else { lossStreak++; winStreak = 0; }
  }
  return { winStreak, lossStreak };
}

function getMultiplier(streak, type) {
  if (type === 'loss') {
    if (streak >= 5) return 0;
    if (streak >= 4) return 0.25;
    if (streak >= 3) return 0.5;
    return 1.0;
  }
  if (type === 'win') {
    if (streak >= 5) return 1.5;
    if (streak >= 3) return 1.25;
    return 1.0;
  }
  return 1.0;
}

describe('StreakHandler Logic', () => {
  it('should detect win streak', () => {
    const trades = [{ pnl: 10 }, { pnl: 20 }, { pnl: 5 }];
    const { winStreak } = calculateStreak(trades);
    assert.equal(winStreak, 3);
  });

  it('should detect loss streak', () => {
    const trades = [{ pnl: -10 }, { pnl: -20 }, { pnl: -5 }];
    const { lossStreak } = calculateStreak(trades);
    assert.equal(lossStreak, 3);
  });

  it('should reset streak on opposite', () => {
    const trades = [{ pnl: 10 }, { pnl: -5 }, { pnl: 10 }];
    const { winStreak, lossStreak } = calculateStreak(trades);
    assert.equal(winStreak, 1);
    assert.equal(lossStreak, 0);
  });

  it('should reduce size after 3 losses', () => {
    assert.equal(getMultiplier(3, 'loss'), 0.5);
  });

  it('should stop after 5 losses', () => {
    assert.equal(getMultiplier(5, 'loss'), 0);
  });

  it('should increase size after 3 wins', () => {
    assert.equal(getMultiplier(3, 'win'), 1.25);
  });

  it('should increase more after 5 wins', () => {
    assert.equal(getMultiplier(5, 'win'), 1.5);
  });

  it('should be normal for no streak', () => {
    assert.equal(getMultiplier(0, 'loss'), 1.0);
    assert.equal(getMultiplier(0, 'win'), 1.0);
  });
});
