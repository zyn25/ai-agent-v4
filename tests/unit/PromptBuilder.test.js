import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PromptBuilder } from '../../ai/PromptBuilder.js';
describe('PromptBuilder', () => {
  const b = new PromptBuilder();
  const signal = { side: 'long', confidence: 75, reason: 'Trend aligned', indicators: { primary: { indicators: { ema: { cross: 'bullish' }, rsi: { value: 55, interpret: 'bullish' }, macd: { interpret: 'bullish_momentum' }, atr: { value: 500 }, volume: { interpret: 'high', ratio: 1.8 } } } } };
  it('build prompt', () => { const p = b.build(signal); assert.ok(p.includes('long')); assert.ok(p.includes('75')); assert.ok(p.includes('JSON')); });
  it('missing indicators', () => { const p = b.build({ side: 'short', confidence: 60, reason: 'test' }); assert.ok(p.includes('short')); assert.ok(p.includes('N/A')); });
  it('all indicator types', () => { const p = b.build(signal); assert.ok(p.includes('EMA')); assert.ok(p.includes('RSI')); assert.ok(p.includes('MACD')); });
});
