import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PaperTrader } from '../../trade/PaperTrader.js';
describe('PaperTrader', () => {
  const t = new PaperTrader({}, {}, {});
  it('profit long', () => { assert.equal(t.calculatePnl(50000, 51000, 0.1, 'long'), 100); });
  it('loss long', () => { assert.equal(t.calculatePnl(50000, 49000, 0.1, 'long'), -100); });
  it('profit short', () => { assert.equal(t.calculatePnl(50000, 49000, 0.1, 'short'), 100); });
  it('loss short', () => { assert.equal(t.calculatePnl(50000, 51000, 0.1, 'short'), -100); });
  it('zero at entry', () => { assert.equal(t.calculatePnl(50000, 50000, 0.1, 'long'), 0); });
  it('scale quantity', () => { assert.equal(t.calculatePnl(50000, 51000, 0.2, 'long'), 200); });
});
