import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../../core/Container.js';
describe('Container', () => {
  it('register and resolve', () => { const c = new Container(); c.register('t', { v: 42 }); assert.deepEqual(c.resolve('t'), { v: 42 }); });
  it('throw on missing', () => { assert.throws(() => new Container().resolve('x')); });
  it('check existence', () => { const c = new Container(); c.register('t', {}); assert.ok(c.has('t')); assert.ok(!c.has('x')); });
  it('overwrite service', () => { const c = new Container(); c.register('t', { v: 1 }); c.register('t', { v: 2 }); assert.equal(c.resolve('t').v, 2); });
  it('handle null', () => { const c = new Container(); c.register('n', null); assert.equal(c.resolve('n'), null); });
});
