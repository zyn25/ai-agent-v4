export class TrendFilter {
  static checkAlignment(p, s, t) {
    if (p === 'neutral') return false;
    if (p === 'bullish') return s !== 'bearish' && t !== 'bearish';
    if (p === 'bearish') return s !== 'bullish' && t !== 'bullish';
    return false;
  }
}
