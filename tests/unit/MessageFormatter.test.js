import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MessageFormatter } from '../../telegram/MessageFormatter.js';

describe('MessageFormatter', () => {
  const fmt = new MessageFormatter();

  const entry = {
    id: 'T-TEST-001', pair: 'BTC/USDT:USDT', side: 'long',
    entry_price: 50000, quantity: 0.1, stop_loss: 49000,
    take_profit: 52000, confidence: 80, riskAmount: 100
  };

  const exit = {
    id: 'T-TEST-001', pair: 'BTC/USDT:USDT', side: 'long',
    entry_price: 50000, exitPrice: 51000, pnl: 100, roi: 2,
    reason: 'take_profit', fees: 2, slippage: 0.5, holdDuration: 3600000
  };

  it('should format entry with trade ID', () => {
    const msg = fmt.formatEntry(entry);
    assert.ok(msg.includes('T-TEST-001'));
    assert.ok(msg.includes('ENTRY'));
  });

  it('should format entry with pair', () => {
    const msg = fmt.formatEntry(entry);
    assert.ok(msg.includes('BTC/USDT:USDT'));
  });

  it('should show long emoji for long', () => {
    const msg = fmt.formatEntry(entry);
    assert.ok(msg.includes('🟢'));
  });

  it('should show short emoji for short', () => {
    const msg = fmt.formatEntry({ ...entry, side: 'short' });
    assert.ok(msg.includes('🔴'));
  });

  it('should include timestamp', () => {
    const msg = fmt.formatEntry(entry);
    assert.ok(msg.includes('🕐'));
  });

  it('should format exit with profit emoji', () => {
    const msg = fmt.formatExit(exit);
    assert.ok(msg.includes('💰'));
  });

  it('should format exit with loss emoji', () => {
    const msg = fmt.formatExit({ ...exit, pnl: -100 });
    assert.ok(msg.includes('💸'));
  });

  it('should include all exit fields', () => {
    const msg = fmt.formatExit(exit);
    assert.ok(msg.includes('PnL'));
    assert.ok(msg.includes('ROI'));
    assert.ok(msg.includes('Reason'));
    assert.ok(msg.includes('Hold'));
    assert.ok(msg.includes('Fees'));
  });

  it('should format partial close', () => {
    const msg = fmt.formatPartialClose({
      id: 'T-TEST-001', closePrice: 51000, closeQty: 0.03,
      pnl: 30, level: 1, remaining: 0.07
    });
    assert.ok(msg.includes('PARTIAL TP'));
    assert.ok(msg.includes('#1'));
  });

  it('should handle null dashboard', () => {
    const msg = fmt.formatDashboard(null, []);
    assert.equal(msg, 'No data');
  });

  it('should format dashboard with data', () => {
    const msg = fmt.formatDashboard(
      { balance: 10000, equity: 10000, daily_pnl: 0, weekly_pnl: 0, monthly_pnl: 0, realized_pnl: 0, peak_balance: 10000, win_rate: 50 },
      []
    );
    assert.ok(msg.includes('DASHBOARD'));
    assert.ok(msg.includes('10000'));
  });

  it('should format empty positions', () => {
    const msg = fmt.formatOpenPositions([], null);
    assert.ok(msg.includes('No open positions'));
  });
});
