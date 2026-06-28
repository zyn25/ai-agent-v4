import { macd } from 'technicalindicators';
export class MACDIndicator {
  static calculate(closes, fast, slow, signal) {
    const result = macd({ values: closes, fastPeriod: fast, slowPeriod: slow, signalPeriod: signal, SimpleMAOscillator: false, SimpleMASignal: false });
    return {
      MACD: result.map(r => r.MACD ?? null),
      signal: result.map(r => r.signal ?? null),
      histogram: result.map(r => r.histogram ?? null),
    };
  }
  static interpret(m, s, h) {
    if (!h || h.length < 2) return 'neutral';
    // Find last two non-null values
    let c = null, p = null;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i] !== null && h[i] !== undefined) {
        if (c === null) c = h[i];
        else { p = h[i]; break; }
      }
    }
    if (c === null || p === null) return 'neutral';
    if (p <= 0 && c > 0) return 'bullish_cross';
    if (p >= 0 && c < 0) return 'bearish_cross';
    if (c > 0 && c > p) return 'bullish_momentum';
    if (c < 0 && c < p) return 'bearish_momentum';
    return 'neutral';
  }
}
