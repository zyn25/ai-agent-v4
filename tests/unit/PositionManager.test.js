import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PositionManager } from '../../trade/PositionManager.js';
describe('PositionManager', () => {
  const pos = { id: 'T-001', pair: 'BTC/USDT', side: 'long', entry_price: 50000, quantity: 0.01 };
  it('track position', () => { const pm = new PositionManager(); pm.track(pos); assert.equal(pm.count(), 1); });
  it('add break_even flag', () => { const pm = new PositionManager(); pm.track(pos); assert.equal(pm.get('T-001').break_even_applied, false); });
  it('update fields', () => { const pm = new PositionManager(); pm.track(pos); pm.update('T-001', { stop_loss: 50000 }); assert.equal(pm.get('T-001').stop_loss, 50000); });
  it('remove position', () => { const pm = new PositionManager(); pm.track(pos); pm.remove('T-001'); assert.equal(pm.count(), 0); });
  it('get all', () => { const pm = new PositionManager(); pm.track(pos); pm.track({...pos, id:'T-002'}); assert.equal(pm.getAll().length, 2); });
  it('empty array', () => { assert.deepEqual(new PositionManager().getAll(), []); });
  it('nonexistent get', () => { assert.equal(new PositionManager().get('x'), undefined); });
  it('update nonexistent', () => { const pm = new PositionManager(); pm.update('x', { stop_loss: 1 }); assert.equal(pm.count(), 0); });
});
