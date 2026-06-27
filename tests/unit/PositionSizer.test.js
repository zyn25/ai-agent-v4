import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PositionSizer } from '../../risk/PositionSizer.js';
describe('PositionSizer', () => {
  it('calculate size', () => {
    const s = new PositionSizer({ risk:{riskPerTrade:1}, exchange:{leverage:10} });
    const r = s.calculate(10000, 50000, 49000);
    assert.ok(r.quantity > 0);
  });
});
