import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResponseParser } from '../../ai/ResponseParser.js';
describe('ResponseParser', () => {
  it('parse valid JSON', () => { const r = new ResponseParser().parse('{"decision":"approve","confidence":85}'); assert.equal(r.decision,'approve'); });
  it('handle malformed', () => { const r = new ResponseParser().parse('looks good'); assert.equal(r.decision,'approve'); });
});
