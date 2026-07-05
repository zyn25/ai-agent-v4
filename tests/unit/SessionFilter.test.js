import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionFilter } from '../../strategy/SessionFilter.js';

describe('SessionFilter', () => {
  const config = {};
  const logger = { info: () => {}, error: () => {}, warn: () => {} };
  const filter = new SessionFilter(config, logger);

  it('should allow trading most of the time', () => {
    const result = filter.check();
    assert.ok(typeof result.trade === 'boolean');
    assert.ok(typeof result.reason === 'string');
    assert.ok(typeof result.session === 'string');
  });

  it('should return valid session name', () => {
    const result = filter.check();
    const valid = ['asian', 'late_asian', 'london', 'london_ny_overlap', 'new_york', 'off_hours', 'deep_off_hours'];
    assert.ok(valid.includes(result.session));
  });

  it('should return score 0-100', () => {
    const score = filter.getSessionScore();
    assert.ok(score >= 0 && score <= 100);
  });

  it('should block deep off-hours', () => {
    const now = new Date();
    const hour = now.getUTCHours();
    const result = filter.check();
    if (hour >= 3 && hour < 5) {
      assert.equal(result.trade, false);
    } else {
      assert.equal(result.trade, true);
    }
  });
});
