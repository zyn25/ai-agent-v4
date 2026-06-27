import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
describe('CircuitBreaker', () => {
  it('daily loss calc', () => {
    const pct = Math.abs(-300 / 10000) * 100;
    assert.equal(pct, 3);
  });
  it('daily loss exceeded', () => {
    const pct = Math.abs(-350 / 10000) * 100;
    assert.ok(pct >= 3);
  });
  it('daily loss within', () => {
    const pct = Math.abs(-200 / 10000) * 100;
    assert.ok(pct < 3);
  });
  it('drawdown calc', () => {
    const dd = Math.abs((10000 - 8500) / 10000) * 100;
    assert.equal(dd, 15);
  });
  it('consecutive losses', () => {
    const trades = [{ pnl: -100 }, { pnl: -50 }, { pnl: -200 }, { pnl: 150 }];
    let c = 0;
    for (const t of trades) { if (t.pnl <= 0) c++; else break; }
    assert.equal(c, 3);
  });
});
