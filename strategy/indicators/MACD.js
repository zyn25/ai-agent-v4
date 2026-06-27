import { macd } from 'technicalindicators';
export class MACDIndicator {
  static calculate(closes, fast, slow, signal) { return macd({ values: closes, fastPeriod: fast, slowPeriod: slow, signalPeriod: signal, SimpleMAOscillator: false, SimpleMASignal: false }); }
  static interpret(m, s, h) {
    if (!h || h.length < 2) return 'neutral';
    const c = h[h.length-1], p = h[h.length-2];
    if (p <= 0 && c > 0) return 'bullish_cross';
    if (p >= 0 && c < 0) return 'bearish_cross';
    if (c > 0 && c > p) return 'bullish_momentum';
    if (c < 0 && c < p) return 'bearish_momentum';
    return 'neutral';
  }
}
