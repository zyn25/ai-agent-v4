export class OrderbookAnalyzer {
  #exchange; #logger;
  constructor(exchange, logger) { this.#exchange = exchange; this.#logger = logger; }

  async analyze(pair, limit = 20) {
    try {
      const ob = await this.#exchange.fetchOrderBook(pair, limit);
      if (!ob || !ob.bids || !ob.asks) return null;

      const bids = ob.bids.slice(0, limit);
      const asks = ob.asks.slice(0, limit);

      const bidVolume = bids.reduce((s, b) => s + b[1], 0);
      const askVolume = asks.reduce((s, a) => s + a[1], 0);
      const totalVolume = bidVolume + askVolume;

      const bestBid = bids[0][0];
      const bestAsk = asks[0][0];
      const spread = bestAsk - bestBid;
      const spreadPercent = (spread / bestBid) * 100;
      const midPrice = (bestBid + bestAsk) / 2;

      const bidAskRatio = askVolume > 0 ? bidVolume / askVolume : 0;

      // Large orders detection (walls)
      const avgBidSize = bidVolume / bids.length;
      const avgAskSize = askVolume / asks.length;
      const largeBids = bids.filter(b => b[1] > avgBidSize * 3);
      const largeAsks = asks.filter(a => a[1] > avgAskSize * 3);

      // Support/Resistance from order clusters
      const support = bids.length > 0 ? bids[0][0] : null;
      const resistance = asks.length > 0 ? asks[0][0] : null;

      // Liquidity score
      const liquidity = totalVolume > 100 ? 'high' : totalVolume > 10 ? 'medium' : 'low';

      // Direction bias
      let bias = 'neutral';
      if (bidAskRatio > 1.5) bias = 'bullish';
      else if (bidAskRatio < 0.67) bias = 'bearish';

      return {
        pair, midPrice, bestBid, bestAsk,
        spread, spreadPercent,
        bidVolume, askVolume, totalVolume,
        bidAskRatio, bias,
        support, resistance,
        largeBids: largeBids.length,
        largeAsks: largeAsks.length,
        liquidity,
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      this.#logger.warn('Orderbook ' + pair + ': ' + e.message);
      return null;
    }
  }

  /**
   * Validate signal using orderbook data
   * Returns: 'approve', 'caution', or 'reject'
   */
  validateSignal(signal, orderbook) {
    if (!orderbook) return 'approve';

    const reasons = [];

    // Check spread (reject if too wide)
    if (orderbook.spreadPercent > 0.1) {
      reasons.push('Spread too wide: ' + orderbook.spreadPercent.toFixed(4) + '%');
    }

    // Check if signal aligns with orderbook bias
    if (signal.side === 'long' && orderbook.bias === 'bearish') {
      reasons.push('Signal long but orderbook bearish');
    }
    if (signal.side === 'short' && orderbook.bias === 'bullish') {
      reasons.push('Signal short but orderbook bullish');
    }

    // Check for large walls against signal
    if (signal.side === 'long' && orderbook.largeAsks > 2) {
      reasons.push('Large sell walls detected');
    }
    if (signal.side === 'short' && orderbook.largeBids > 2) {
      reasons.push('Large buy walls detected');
    }

    // Check liquidity
    if (orderbook.liquidity === 'low') {
      reasons.push('Low liquidity');
    }

    if (reasons.length >= 3) return 'reject';
    if (reasons.length >= 1) return 'caution';
    return 'approve';
  }
}
