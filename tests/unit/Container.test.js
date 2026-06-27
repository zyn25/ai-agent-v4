import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../../core/Container.js';
describe('Container', () => {
  it('register and resolve', () => { const c = new Container(); c.register('t', { v: 42 }); assert.deepEqual(c.resolve('t'), { v: 42 }); });
  it('throw on missing', () => { assert.throws(() => new Container().resolve('x')); });
});
