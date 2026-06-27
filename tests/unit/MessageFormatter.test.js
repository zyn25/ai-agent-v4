import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MessageFormatter } from '../../telegram/MessageFormatter.js';
describe('MessageFormatter', () => {
  const f = new MessageFormatter();
  const entry = { id: 'T-001', pair: 'BTC/USDT', side: 'long', entry_price: 50000, quantity: 0.1, stop_loss: 49000, take_profit: 52000, confidence: 80, riskAmount: 100 };
  const exit = { id: 'T-001', pair: 'BTC/USDT', side: 'long', entry_price: 50000, exitPrice: 51000, pnl: 100, roi: 2, reason: 'take_profit', fees: 2, holdDuration: 3600000 };
  it('entry has ID', () => { assert.ok(f.formatEntry(entry).includes('T-001')); });
  it('entry long emoji', () => { assert.ok(f.formatEntry(entry).includes('🟢')); });
  it('entry short emoji', () => { assert.ok(f.formatEntry({ ...entry, side: 'short' }).includes('🔴')); });
  it('entry timestamp', () => { assert.ok(f.formatEntry(entry).includes('🕐')); });
  it('exit profit emoji', () => { assert.ok(f.formatExit(exit).includes('💰')); });
  it('exit loss emoji', () => { assert.ok(f.formatExit({ ...exit, pnl: -100 }).includes('💸')); });
  it('exit has fields', () => { const m = f.formatExit(exit); assert.ok(m.includes('PnL')); assert.ok(m.includes('ROI')); });
  it('dashboard null', () => { assert.equal(f.formatDashboard(null, []), 'No data'); });
  it('empty positions', () => { assert.ok(f.formatOpenPositions([]).includes('No open')); });
});
