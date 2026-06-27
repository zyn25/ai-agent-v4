import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResponseParser } from '../../ai/ResponseParser.js';
describe('ResponseParser', () => {
  const p = new ResponseParser();
  it('parse valid JSON', () => {
    const r = p.parse('{"decision":"approve","confidence":85,"reason":"ok"}');
    assert.equal(r.decision, 'approve');
    assert.equal(r.confidence, 85);
  });
  it('parse reject', () => { assert.equal(p.parse('{"decision":"reject","confidence":20}').decision, 'reject'); });
  it('parse wait', () => { assert.equal(p.parse('{"decision":"wait","confidence":50}').decision, 'wait'); });
  it('handle malformed', () => { assert.equal(p.parse('looks good to approve').decision, 'approve'); });
  it('handle empty', () => { assert.ok(['approve','reject','wait'].includes(p.parse('').decision)); });
  it('reject invalid decision', () => { assert.equal(p.parse('{"decision":"invalid"}').decision, 'reject'); });
  it('clamp above 100', () => { assert.equal(p.parse('{"decision":"approve","confidence":150}').confidence, 100); });
  it('clamp below 0', () => { assert.equal(p.parse('{"decision":"approve","confidence":-10}').confidence, 0); });
  it('extract JSON from text', () => {
    const r = p.parse('Analysis: {"decision":"approve","confidence":75} done');
    assert.equal(r.decision, 'approve');
  });
  it('fallback on buy keyword', () => { assert.equal(p.parse('you should buy now').decision, 'approve'); });
  it('fallback on wait keyword', () => { assert.equal(p.parse('wait for better').decision, 'wait'); });
  it('has all fields', () => {
    const r = p.parse('{"decision":"approve","confidence":80}');
    assert.ok('decision' in r);
    assert.ok('confidence' in r);
    assert.ok('reason' in r);
  });
});
