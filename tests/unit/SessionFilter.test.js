import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionFilter } from '../../strategy/SessionFilter.js';

describe('SessionFilter', () => {
  const config = {};
  const logger = { info: () => {}, error: () => {}, warn: () => {} };
  const filter = new SessionFilter(config, logger);

  it('should return an object with trade and reason', () => {
    const result = filter.check();
    assert.ok(typeof result.trade === 'boolean');
    assert.ok(typeof result.reason === 'string');
    assert.ok(typeof result.session === 'string');
  });

  it('should return session score', () => {
    const score = filter.getSessionScore();
    assert.ok(typeof score === 'number');
    assert.ok(score >= 0 && score <= 100);
  });

  it('should block weekends', () => {
    const now = new Date();
    const day = now.getDay();
    const result = filter.check();
    if (day === 0 || day === 6) {
      assert.equal(result.trade, false);
      assert.ok(result.reason.includes('Weekend'));
    }
  });
});
