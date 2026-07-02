import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../../core/EventBus.js';
describe('EventBus', () => {
  it('emit and receive', () => { const b = new EventBus(); let r = null; b.on('t', d => r = d); b.emit('t', 'hi'); assert.equal(r, 'hi'); });
  it('multiple listeners', () => { const b = new EventBus(); let c = 0; b.on('t', () => c++); b.on('t', () => c++); b.emit('t'); assert.equal(c, 2); });
  it('safeEmit returns false on error', () => { const b = new EventBus(); b.on('t', () => { throw new Error(); }); assert.equal(b.safeEmit('t'), false); });
  it('safeEmit returns true on success', () => { const b = new EventBus(); b.on('t', () => {}); assert.equal(b.safeEmit('t'), true); });
  it('safeEmit returns false when no listeners', () => { const b = new EventBus(); assert.equal(b.safeEmit('nonexistent'), false); });
  it('pass multiple args', () => { const b = new EventBus(); let a; b.on('t', (...args) => a = args); b.emit('t', 1, 2, 3); assert.deepEqual(a, [1, 2, 3]); });
  it('remove listener', () => { const b = new EventBus(); let c = 0; const h = () => c++; b.on('t', h); b.emit('t'); b.removeListener('t', h); b.emit('t'); assert.equal(c, 1); });
});
