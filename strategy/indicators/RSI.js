import { rsi } from 'technicalindicators';
export class RSIIndicator {
  static calculate(closes, period) { return rsi({ period, values: closes }); }
  static interpret(v, ob, os) { if (v >= ob) return 'overbought'; if (v <= os) return 'oversold'; return v >= 50 ? 'bullish' : 'bearish'; }
}
