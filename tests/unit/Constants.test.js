import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POSITION_STATUS, SIDE, AI_DECISION, EXIT_REASON } from '../../utils/constants.js';
describe('Constants', () => {
  it('position status', () => { assert.equal(POSITION_STATUS.OPEN, 'open'); assert.equal(POSITION_STATUS.CLOSED, 'closed'); });
  it('sides', () => { assert.equal(SIDE.LONG, 'long'); assert.equal(SIDE.SHORT, 'short'); });
  it('ai decisions', () => { assert.equal(AI_DECISION.APPROVE, 'approve'); assert.equal(AI_DECISION.REJECT, 'reject'); });
  it('exit reasons', () => { assert.equal(EXIT_REASON.STOP_LOSS, 'stop_loss'); assert.equal(EXIT_REASON.TAKE_PROFIT, 'take_profit'); });
});
