import { EMAIndicator } from '../strategy/indicators/EMA.js';
import { RSIIndicator } from '../strategy/indicators/RSI.js';
import { MACDIndicator } from '../strategy/indicators/MACD.js';
import { ATRIndicator } from '../strategy/indicators/ATR.js';
import { VolumeIndicator } from '../strategy/indicators/Volume.js';
import { TrendStrength } from '../strategy/TrendStrength.js';
import { PullbackFilter } from '../strategy/PullbackFilter.js';
import { EntryConfirmation } from '../strategy/EntryConfirmation.js';
import { VolumeSpikeFilter } from '../strategy/VolumeSpikeFilter.js';
import { MomentumCheck } from '../strategy/MomentumCheck.js';

export class BacktestEngine {
  #config; #trendStrength; #pullback; #entryConfirm; #volumeSpike; #momentum;

  constructor(config) {
    this.#config = config;
    this.#trendStrength = new TrendStrength(config, { info: () => {}, warn: () => {}, error: () => {} });
    this.#pullback = new PullbackFilter({ info: () => {}, warn: () => {}, error: () => {} });
    this.#entryConfirm = new EntryConfirmation({ info: () => {}, warn: () => {}, error: () => {} });
    this.#volumeSpike = new VolumeSpikeFilter({ info: () => {}, warn: () => {}, error: () => {} });
    this.#momentum = new MomentumCheck({ info: () => {}, warn: () => {}, error: () => {} });
  }

  async run(exchange, pair, timeframe, days) {
    const limit = Math.min(days * 24 * 4, 1500);
    console.log('Fetching ' + limit + ' candles for ' + pair + ' ' + timeframe + '...');
    const ohlcv = await exchange.fetchOHLCV(pair, timeframe, undefined, limit);
    if (!ohlcv || ohlcv.length < 200) return { error: 'Not enough data' };

    console.log('Candles: ' + ohlcv.length);

    const closes = ohlcv.map(c => c[4]);
    const highs = ohlcv.map(c => c[2]);
    const lows = ohlcv.map(c => c[3]);
    const opens = ohlcv.map(c => c[1]);
    const volumes = ohlcv.map(c => c[5]);

    const ind = this.#config.indicators;
    const emaFast = EMAIndicator.calculate(closes, ind.emaFast);
    const emaSlow = EMAIndicator.calculate(closes, ind.emaSlow);
    const rsiValues = RSIIndicator.calculate(closes, ind.rsiPeriod);
    const macdResult = MACDIndicator.calculate(closes, ind.macdFast, ind.macdSlow, ind.macdSignal);
    const atrValues = ATRIndicator.calculate(highs, lows, closes, ind.atrPeriod);
    const histogram = macdResult && macdResult.histogram ? macdResult.histogram : [];

    console.log('Indicators: emaFast=' + emaFast.length + ' emaSlow=' + emaSlow.length + ' rsi=' + rsiValues.length + ' atr=' + atrValues.length);

    const offset = Math.max(ind.emaSlow, 30);
    console.log('Start trading from candle: ' + offset);

    let balance = this.#config.trading.startingBalance;
    let peakBalance = balance;
    let maxDrawdown = 0;
    let wins = 0, losses = 0, totalPnl = 0;
    let grossProfit = 0, grossLoss = 0;
    let openPosition = null;
    const trades = [];
    let signalsGenerated = 0;
    let filterBlocked = 0;

    for (let i = offset; i < ohlcv.length; i++) {
      const price = closes[i];
      const high = highs[i];
      const low = lows[i];
      const time = new Date(ohlcv[i][0]).toISOString().substring(0, 16);

      // Check open position
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

        if (i - openPosition.idx > 96 && !closed) {
          exitPrice = price; reason = 'max_hold'; closed = true;
        }

        if (closed) {
          const pnl = (openPosition.side === 'long' ? exitPrice - openPosition.entry : openPosition.entry - exitPrice) * openPosition.qty;
          const fees = exitPrice * openPosition.qty * 0.0004;
          const net = pnl - fees;
          balance += net;
          totalPnl += net;

          if (net > 0) { wins++; grossProfit += net; }
          else { losses++; grossLoss += Math.abs(net); }

          if (balance > peakBalance) peakBalance = balance;
          const dd = ((peakBalance - balance) / peakBalance) * 100;
          if (dd > maxDrawdown) maxDrawdown = dd;

          trades.push({ entry: openPosition.entry, exit: exitPrice, side: openPosition.side, pnl: net, reason, time: openPosition.time, exitTime: time });
          openPosition = null;
        }
      }

      // Generate signal with ALL filters
      if (!openPosition) {
        const fi = i - offset;
        if (fi >= 0 && fi < emaFast.length && fi < emaSlow.length && fi < rsiValues.length && fi < atrValues.length && fi < histogram.length) {
          const fast = emaFast[fi];
          const slow = emaSlow[fi];
          const rsi = rsiValues[fi];
          const atr = atrValues[fi];
          const hist = histogram[fi];

          if (fast && slow && rsi && atr && hist !== undefined && hist !== null) {
            let score = 0;
            if (fast > slow) score += 30; else score -= 30;
            if (rsi > 50 && rsi < 70) score += 20; else if (rsi < 50 && rsi > 30) score -= 20;
            if (hist > 0) score += 25; else score -= 25;

            const vol = VolumeIndicator.calculate(volumes.slice(0, i + 1));
            if (vol.ratio >= 1.5) score *= 1.1; else if (vol.ratio < 0.8) score *= 0.7;

            const side = score > 0 ? 'long' : 'short';
            const confidence = Math.min(Math.abs(score), 100);

            // Apply ALL new filters
            const threshold = 45; // Balanced mode

            // Filter 1: Trend strength
            const trendSlice = closes.slice(Math.max(0, i - 100), i + 1);
            const trend = this.#trendStrength.analyze(trendSlice);

            // Filter 2: Entry confirmation
            const entrySlice = closes.slice(Math.max(0, i - 5), i + 1);
            const opensSlice = opens.slice(Math.max(0, i - 5), i + 1);
            const entryConfirm = this.#entryConfirm.check(entrySlice, opensSlice, side);

            // Filter 3: Pullback
            const closesSlice = closes.slice(Math.max(0, i - 20), i + 1);
            const highsSlice = highs.slice(Math.max(0, i - 20), i + 1);
            const lowsSlice = lows.slice(Math.max(0, i - 20), i + 1);
            const pullback = this.#pullback.check(closesSlice, highsSlice, lowsSlice, side);

            // Filter 4: Volume
            const volSlice = volumes.slice(Math.max(0, i - 20), i + 1);
            const volumeCheck = this.#volumeSpike.check(volSlice);

            // Filter 5: Momentum
            const momentumCheck = this.#momentum.check(closes.slice(Math.max(0, i - 10), i + 1), side);

            // All filters must pass
            let allPass = true;
            if (!trend.tradeable) allPass = false;
            if (!entryConfirm.confirmed) allPass = false;
            if (!pullback.valid) allPass = false;
            if (!volumeCheck.valid) allPass = false;
            if (!momentumCheck.valid) allPass = false;
            if (confidence <= threshold) allPass = false;

            if (allPass) {
              signalsGenerated++;
              const sl = side === 'long' ? price - atr * ind.atrSlMultiplier : price + atr * ind.atrSlMultiplier;
              const tp = side === 'long' ? price + atr * ind.atrTpMultiplier : price - atr * ind.atrTpMultiplier;
              const risk = balance * (this.#config.risk.riskPerTrade / 100);
              const dist = Math.abs(price - sl);
              const qty = dist > 0 ? risk / dist : 0;

              if (qty > 0 && balance > 0) {
                openPosition = { entry: price, side, qty, sl, tp, time, idx: i };
                if (signalsGenerated <= 5) {
                  console.log('Signal #' + signalsGenerated + ': ' + side + ' @ ' + price.toFixed(2) + ' conf=' + confidence + ' trend=' + trend.strength);
                }
              }
            } else {
              filterBlocked++;
            }
          }
        }
      }
    }

    console.log('Signals generated: ' + signalsGenerated);
    console.log('Filters blocked: ' + filterBlocked);
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
      startBalance: this.#config.trading.startingBalance,
      endBalance: balance.toFixed(2),
      trades: trades.slice(-20)
    };
  }
}
