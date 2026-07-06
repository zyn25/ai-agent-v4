import { EMAIndicator } from './indicators/EMA.js';
import { RSIIndicator } from './indicators/RSI.js';
import { MACDIndicator } from './indicators/MACD.js';
import { ATRIndicator } from './indicators/ATR.js';
import { VolumeIndicator } from './indicators/Volume.js';
import { TrendFilter } from './TrendFilter.js';
import { TrendStrength } from './TrendStrength.js';
import { SIDE } from '../utils/constants.js';

export class SignalEngine {
  #config;
  #logger;
  #marketData;
  #strategyMode;
  #trendStrength;

  constructor(config, logger, marketData, strategyMode) {
    this.#config = config;
    this.#logger = logger;
    this.#marketData = marketData;
    this.#strategyMode = strategyMode;
    this.#trendStrength = new TrendStrength(config, logger);
  }

  async analyze(pair) {
    const targetPair = pair || this.#config.exchange.pair;
    try {
      const { primary, secondary, tertiary } = this.#config.timeframes;
      const [pd, sd, td] = await Promise.all([
        this.#fetch(targetPair, primary),
        this.#fetch(targetPair, secondary),
        this.#fetch(targetPair, tertiary)
      ]);

      if (!pd || !sd || !td) {
        this.#logger.warn('Signal ' + targetPair + ': Data fetch failed.');
        return { pair: targetPair, side: 'neutral', confidence: 0, reason: 'Data fetch failed' };
      }

      const ps = this.#calc(pd, 50);
      const ss = this.#calc(sd, 30);
      const ts = this.#calc(td, 20);

      if (!ps || !ss || !ts) {
        this.#logger.warn('Signal ' + targetPair + ': Calc failed.');
        return { pair: targetPair, side: 'neutral', confidence: 0, reason: 'Calc failed' };
      }

      const trend = this.#trendStrength.analyze(pd.closes);
      if (!trend.tradeable) {
        return { pair: targetPair, side: 'neutral', confidence: 0, reason: 'Weak trend (' + trend.strength + ')' };
      }

      const mtf = ps.score + ss.score + ts.score;
      const aligned = TrendFilter.checkAlignment(ps.trend, ss.trend, ts.trend);

      const rawThreshold = this.#strategyMode ? this.#strategyMode.getConfidenceThreshold() : this.#config.indicators.confidenceThreshold;
      const threshold = isNaN(Number(rawThreshold)) ? 45 : Number(rawThreshold);

      this.#logger.trade('SIGNAL: ' + targetPair + ' | ' +
        primary + ':' + ps.trend + '(' + ps.score.toFixed(1) + ') | ' +
        secondary + ':' + ss.trend + '(' + ss.score.toFixed(1) + ') | ' +
        tertiary + ':' + ts.trend + '(' + ts.score.toFixed(1) + ') | MTF:' + mtf.toFixed(1) +
        ' | Aligned:' + aligned + ' | Trend:' + trend.strength + ' | Threshold:' + threshold);

      if (!aligned) {
        return { pair: targetPair, side: 'neutral', confidence: 0, reason: 'Not aligned (' + ps.trend + '/' + ss.trend + '/' + ts.trend + ')' };
      }

      if (mtf === 0) {
        return { pair: targetPair, side: 'neutral', confidence: 0, reason: 'Sideways (MTF Netral)' };
      }

      const side = mtf > 0 ? SIDE.LONG : SIDE.SHORT;
      const confidence = Math.min(Math.abs(mtf), 100);

      if (confidence <= threshold) {
        return { pair: targetPair, side: 'neutral', confidence, reason: 'Below threshold (' + threshold + '%, got ' + confidence.toFixed(1) + '%)' };
      }

      return {
        pair: targetPair,
        side,
        confidence: Math.round(confidence),
        reason: 'Signal generated',
        indicators: { primary: ps, secondary: ss, tertiary: ts }
      };
    } catch (e) {
      this.#logger.error('Signal ' + targetPair + ':', e.message);
      return { pair: targetPair, side: 'neutral', confidence: 0, reason: e.message };
    }
  }

  async analyzeAll() {
    const signals = [];
    const pairs = this.#config.pairs || [this.#config.exchange.pair];
    for (const pair of pairs) {
      const signal = await this.analyze(pair);
      if (signal.side !== 'neutral') signals.push(signal);
    }
    return signals;
  }

  async #fetch(pair, tf) {
    try {
      const ohlcv = await this.#marketData.fetchOHLCV(pair, tf, 200);
      if (!ohlcv || ohlcv.length < 50) return null;
      return {
        opens: ohlcv.map(c => c[1]),
        highs: ohlcv.map(c => c[2]),
        lows: ohlcv.map(c => c[3]),
        closes: ohlcv.map(c => c[4]),
        volumes: ohlcv.map(c => c[5])
      };
    } catch (e) {
      this.#logger.warn('Fetch ' + pair + ' ' + tf + ': ' + e.message);
      return null;
    }
  }

  #calc(d, w) {
    try {
      const { closes, highs, lows, volumes } = d;
      const ind = this.#config.indicators;

      const ef = EMAIndicator.calculate(closes, ind.emaFast);
      const es = EMAIndicator.calculate(closes, ind.emaSlow);
      if (!ef.length || !es.length) return null;
      const ec = EMAIndicator.crossover(ef, es);

      const rv = RSIIndicator.calculate(closes, ind.rsiPeriod);
      if (!rv || rv.length === 0) return null;
      const rsiVal = rv[rv.length - 1];
      const ri = RSIIndicator.interpret(rsiVal, ind.rsiOverbought, ind.rsiOversold);

      const mc = MACDIndicator.calculate(closes, ind.macdFast, ind.macdSlow, ind.macdSignal);
      const mi = mc && mc.histogram ? MACDIndicator.interpret(mc.MACD, mc.signal, mc.histogram) : 'neutral';

      const av = ATRIndicator.calculate(highs, lows, closes, ind.atrPeriod);
      if (!av || av.length === 0) return null;

      const vd = VolumeIndicator.calculate(volumes);
      const vi = vd ? VolumeIndicator.interpret(vd.ratio) : 'neutral';

      let score = 0;
      if (ec === 'bullish' || ec === 'above') score += w * 0.3;
      else if (ec === 'bearish' || ec === 'below') score -= w * 0.3;

      if (ri === 'bullish') score += w * 0.2;
      else if (ri === 'bearish') score -= w * 0.2;

      // Fix string 'bearish' (sebelumnya tertulis 'beish' secara tidak sengaja)
      if (mi.includes('bullish')) score += w * 0.25;
      else if (mi.includes('bearish')) score -= w * 0.25;

      if (vi === 'high' || vi === 'very_high') score *= 1.1;
      else if (vi === 'low') score *= 0.7;

      const trend = score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';

      return {
        score,
        trend,
        weight: w,
        indicators: {
          ema: { fast: ef[ef.length - 1], slow: es[es.length - 1], cross: ec },
          rsi: { value: rsiVal, interpret: ri },
          macd: { interpret: mi },
          atr: { value: av[av.length - 1] },
          volume: { ratio: vd ? vd.ratio : 0, interpret: vi }
        }
      };
    } catch (e) {
      this.#logger.error('Calc error: ' + e.message);
      return null;
    }
  }
}
