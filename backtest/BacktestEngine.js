import { EMAIndicator } from '../strategy/indicators/EMA.js';
import { RSIIndicator } from '../strategy/indicators/RSI.js';
import { MACDIndicator } from '../strategy/indicators/MACD.js';
import { ATRIndicator } from '../strategy/indicators/ATR.js';
import { VolumeIndicator } from '../strategy/indicators/Volume.js';

export class BacktestEngine {
  #config;
  constructor(config) { this.#config = config; }

  async run(exchange, pair, timeframe, days) {
    const limit = Math.min(days * 24 * 4, 1500);
    console.log('Fetching ' + limit + ' candles for ' + pair + ' ' + timeframe + '...');
    const ohlcv = await exchange.fetchOHLCV(pair, timeframe, undefined, limit);
    if (!ohlcv || ohlcv.length < 200) return { error: 'Not enough data (need 200+, got ' + (ohlcv ? ohlcv.length : 0) + ')' };

    console.log('Candles: ' + ohlcv.length);

    const closes = ohlcv.map(c => c[4]);
    const highs = ohlcv.map(c => c[2]);
    const lows = ohlcv.map(c => c[3]);
    const volumes = ohlcv.map(c => c[5]);

    const ind = this.#config.indicators;
    const emaFast = EMAIndicator.calculate(closes, ind.emaFast);
    const emaSlow = EMAIndicator.calculate(closes, ind.emaSlow);
    const rsiValues = RSIIndicator.calculate(closes, ind.rsiPeriod);
    const macdResult = MACDIndicator.calculate(closes, ind.macdFast, ind.macdSlow, ind.macdSignal);
    const atrValues = ATRIndicator.calculate(highs, lows, closes, ind.atrPeriod);

    console.log('Indicators: emaFast=' + emaFast.length + ' emaSlow=' + emaSlow.length + ' rsi=' + rsiValues.length + ' macd=' + macdResult.histogram.length + ' atr=' + atrValues.length);

    // Each indicator starts at a different candle index
    // emaFast[0] = candle at index (emaFast_period - 1)
    // emaSlow[0] = candle at index (emaSlow_period - 1)
    // rsi[0] = candle at index (rsi_period)
    // atr[0] = candle at index (atr_period)
    // macd[0] = candle at index (macd_slow - 1)
    const emaFastStart = ind.emaFast - 1;
    const emaSlowStart = ind.emaSlow - 1;
    const rsiStart = ind.rsiPeriod;
    const atrStart = ind.atrPeriod;
    const macdStart = ind.macdSlow - 1;

    // Can only trade when ALL indicators have data
    const startIndex = Math.max(emaFastStart, emaSlowStart, rsiStart, atrStart, macdStart) + 1;
    console.log('Start trading from candle: ' + startIndex);

    let balance = this.#config.trading.startingBalance;
    let peakBalance = balance;
    let maxDrawdown = 0;
    let wins = 0, losses = 0, totalPnl = 0;
    let grossProfit = 0, grossLoss = 0;
    let consecWins = 0, maxConsecWins = 0;
    let consecLosses = 0, maxConsecLosses = 0;
    let openPosition = null;
    const trades = [];
    let signalsGenerated = 0;

    for (let i = startIndex; i < ohlcv.length; i++) {
      const price = closes[i];
      const high = highs[i];
      const low = lows[i];
      const time = new Date(ohlcv[i][0]).toISOString().substring(0, 16);

      // Correct index for each indicator
      const fi = i - emaFastStart;  // emaFast index
      const si = i - emaSlowStart;  // emaSlow index
      const ri = i - rsiStart;      // rsi index
      const ai = i - atrStart;      // atr index
      const mi = i - macdStart;     // macd index

      // Check open position for exit
      if (openPosition) {
        let closed = false;
        let exitPrice = price;
        let reason = '';

        if (openPosition.side === 'long') {
          if (low <= openPosition.sl) { exitPrice = openPosition.sl; reason = 'stop_loss'; closed = true; }
          else if (high >= openPosition.tp) { exitPrice = openPosition.tp; reason = 'take_profit'; closed = true; }
        } else {
          if (high >= openPosition.sl) { exitPrice = openPosition.sl; reason = 'stop_loss'; closed = true; }
          else if (low <= openPosition.tp) { exitPrice = openPosition.tp; reason = 'take_profit'; closed = true; }
        }
        if (i - openPosition.idx > 96 && !closed) { exitPrice = price; reason = 'max_hold'; closed = true; }

        if (closed) {
          const pnl = (openPosition.side === 'long' ? exitPrice - openPosition.entry : openPosition.entry - exitPrice) * openPosition.qty;
          const fees = exitPrice * openPosition.qty * 0.0004;
          const net = pnl - fees;
          balance += net;
          totalPnl += net;

          if (net > 0) { wins++; grossProfit += net; consecWins++; consecLosses = 0; maxConsecWins = Math.max(maxConsecWins, consecWins); }
          else { losses++; grossLoss += Math.abs(net); consecLosses++; consecWins = 0; maxConsecLosses = Math.max(maxConsecLosses, consecLosses); }
          if (balance > peakBalance) peakBalance = balance;
          const dd = ((peakBalance - balance) / peakBalance) * 100;
          if (dd > maxDrawdown) maxDrawdown = dd;

          trades.push({ entry: openPosition.entry, exit: exitPrice, side: openPosition.side, pnl: net, reason, time: openPosition.time, exitTime: time });
          openPosition = null;
        }
      }

      // Generate signal
      if (!openPosition) {
        const fast = emaFast[fi];
        const slow = emaSlow[si];
        const rsi = rsiValues[ri];
        const atr = atrValues[ai];
        const hist = macdResult.histogram[mi];

        if (fast !== undefined && slow !== undefined && rsi !== undefined && atr !== undefined && hist !== null && hist !== undefined) {
          let score = 0;
          if (fast > slow) score += 30; else score -= 30;
          if (rsi > 50 && rsi < 70) score += 20; else if (rsi < 50 && rsi > 30) score -= 20;
          if (hist > 0) score += 25; else score -= 25;

          const vol = VolumeIndicator.calculate(volumes.slice(0, i + 1));
          if (vol.ratio >= 1.5) score *= 1.1; else if (vol.ratio < 0.8) score *= 0.7;

          const side = score > 0 ? 'long' : 'short';
          const confidence = Math.min(Math.abs(score), 100);

          if (confidence >= this.#config.indicators.confidenceThreshold) {
            signalsGenerated++;
            const sl = side === 'long' ? price - atr * ind.atrSlMultiplier : price + atr * ind.atrSlMultiplier;
            const tp = side === 'long' ? price + atr * ind.atrTpMultiplier : price - atr * ind.atrTpMultiplier;
            const risk = balance * (this.#config.risk.riskPerTrade / 100);
            const dist = Math.abs(price - sl);
            const qty = dist > 0 ? risk / dist : 0;

            if (qty > 0 && balance > 0) {
              openPosition = { entry: price, side, qty, sl, tp, time, idx: i };
              if (signalsGenerated <= 5) {
                console.log('Signal #' + signalsGenerated + ': ' + side + ' @ ' + price.toFixed(2) + ' conf=' + confidence + ' fast=' + fast.toFixed(2) + ' slow=' + slow.toFixed(2) + ' rsi=' + rsi.toFixed(1) + ' hist=' + hist.toFixed(4));
              }
            }
          }
        }
      }
    }

    console.log('Signals generated: ' + signalsGenerated);
    console.log('Trades executed: ' + (wins + losses));

    const total = wins + losses;
    return {
      pair, timeframe, days,
      totalTrades: total, wins, losses,
      winRate: total > 0 ? (wins / total * 100).toFixed(1) : '0.0',
      totalPnl: totalPnl.toFixed(2),
      roi: ((totalPnl / this.#config.trading.startingBalance) * 100).toFixed(2),
      profitFactor: grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : 'N/A',
      maxDrawdown: maxDrawdown.toFixed(2),
      maxConsecWins, maxConsecLosses,
      avgWin: wins > 0 ? (grossProfit / wins).toFixed(2) : '0',
      avgLoss: losses > 0 ? (grossLoss / losses).toFixed(2) : '0',
      expectancy: total > 0 ? (totalPnl / total).toFixed(2) : '0',
      startBalance: this.#config.trading.startingBalance,
      endBalance: balance.toFixed(2),
      peakBalance: peakBalance.toFixed(2),
      trades: trades.slice(-20)
    };
  }
}
