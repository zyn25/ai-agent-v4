import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../../core/EventBus.js';
describe('EventBus', () => {
  it('emit and receive', () => { const b = new EventBus(); let r=null; b.on('t', d => r=d); b.emit('t','hi'); assert.equal(r,'hi'); });
});
