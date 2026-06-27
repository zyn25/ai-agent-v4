import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Logger } from '../../core/Logger.js';
describe('Logger', () => {
  const config = { logging: { level: 'info', maxSizeMB: 50, maxFiles: 10 } };
  it('create instance', () => { assert.ok(new Logger(config)); });
  it('has methods', () => {
    const l = new Logger(config);
    ['debug','info','warn','error','trade','telegram','ai'].forEach(m => assert.equal(typeof l[m], 'function'));
  });
  it('no throw', () => {
    const l = new Logger(config);
    assert.doesNotThrow(() => l.info('test'));
    assert.doesNotThrow(() => l.error('test'));
    assert.doesNotThrow(() => l.trade('test'));
  });
  it('handle objects', () => { assert.doesNotThrow(() => new Logger(config).info('test', { k: 'v' })); });
  it('handle multiple args', () => { assert.doesNotThrow(() => new Logger(config).info('a', 'b', 'c', 123)); });
});
