import { atr } from 'technicalindicators';
export class ATRIndicator {
  static calculate(h, l, c, p) { return atr({ high: h, low: l, close: c, period: p }); }
}
