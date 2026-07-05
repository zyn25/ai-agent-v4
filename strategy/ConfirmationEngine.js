import { EMAIndicator } from './indicators/EMA.js';
import { RSIIndicator } from './indicators/RSI.js';
import { MACDIndicator } from './indicators/MACD.js';
import { ATRIndicator } from './indicators/ATR.js';
import { VolumeIndicator } from './indicators/Volume.js';

/**
 * Multi-signal confirmation engine.
 * Requires multiple indicators to agree before generating signal.
 */
export class ConfirmationEngine {
  #config;
  #logger;

  constructor(config, logger) {
    this.#config = config;
    this.#logger = logger;
  }

  confirm(data) {
    const { closes, highs, lows, volumes, indicators } = data;
    const results = [];
    let totalScore = 0;
    let confirmations = 0;
    let disqualifiers = 0;

    const emaResult = this.#checkEMA(indicators);
    results.push(emaResult);
    totalScore += emaResult.score;
    if (emaResult.confirmed) confirmations++;
    if (emaResult.disqualifier) disqualifiers++;

    const rsiResult = this.#checkRSI(indicators);
    results.push(rsiResult);
    totalScore += rsiResult.score;
    if (rsiResult.confirmed) confirmations++;
    if (rsiResult.disqualifier) disqualifiers++;

    const macdResult = this.#checkMACD(indicators);
    results.push(macdResult);
    totalScore += macdResult.score;
    if (macdResult.confirmed) confirmations++;
    if (macdResult.disqualifier) disqualifiers++;

    const volResult = this.#checkVolume(indicators);
    results.push(volResult);
    totalScore += volResult.score;
    if (volResult.confirmed) confirmations++;

    const paResult = this.#checkPriceAction(closes, highs, lows);
    results.push(paResult);
    totalScore += paResult.score;
    if (paResult.confirmed) confirmations++;

    const momResult = this.#checkMomentum(closes);
    results.push(momResult);
    totalScore += momResult.score;
    if (momResult.confirmed) confirmations++;

    const minConfirmations = 3;
    const confirmed = confirmations >= minConfirmations && disqualifiers === 0;

    return {
      confirmed,
      score: totalScore,
      confirmations,
      disqualifiers,
      minRequired: minConfirmations,
      results,
      side: this.#determineSide(results),
      reason: confirmed
        ? confirmations + '/' + results.length + ' indicators agree'
        : 'Only ' + confirmations + '/' + minConfirmations + ' confirmations (need ' + minConfirmations + ')'
    };
  }

  #checkEMA(indicators) {
    if (!indicators || !indicators.ema) return { name: 'EMA', score: 0, confirmed: false, side: 'neutral' };
    const { cross, fast, slow } = indicators.ema;
    let score = 0, confirmed = false, side = 'neutral';
    if (cross === 'bullish') { score = 25; confirmed = true; side = 'long'; }
    else if (cross === 'bearish') { score = -25; confirmed = true; side = 'short'; }
    else if (cross === 'above') { score = 15; confirmed = true; side = 'long'; }
    else if (cross === 'below') { score = -15; confirmed = true; side = 'short'; }
    return { name: 'EMA', score, confirmed, side, detail: cross };
  }

  #checkRSI(indicators) {
    if (!indicators || !indicators.rsi) return { name: 'RSI', score: 0, confirmed: false, side: 'neutral' };
    const { value, interpret } = indicators.rsi;
    let score = 0, confirmed = false, side = 'neutral', disqualifier = false;
    if (interpret === 'overbought') { score = -10; confirmed = true; side = 'short'; }
    else if (interpret === 'oversold') { score = 10; confirmed = true; side = 'long'; }
    else if (value >= 50 && value <= 65) { score = 20; confirmed = true; side = 'long'; }
    else if (value >= 35 && value < 50) { score = -20; confirmed = true; side = 'short'; }
    else if (value > 80) { disqualifier = true; side = 'short'; }
    else if (value < 20) { disqualifier = true; side = 'long'; }
    return { name: 'RSI', score, confirmed, side, disqualifier, detail: (value ? value.toFixed(1) : 'N/A') + ' ' + interpret };
  }

  #checkMACD(indicators) {
    if (!indicators || !indicators.macd) return { name: 'MACD', score: 0, confirmed: false, side: 'neutral' };
    const { interpret } = indicators.macd;
    let score = 0, confirmed = false, side = 'neutral';
    if (interpret === 'bullish_cross') { score = 25; confirmed = true; side = 'long'; }
    else if (interpret === 'bearish_cross') { score = -25; confirmed = true; side = 'short'; }
    else if (interpret === 'bullish_momentum') { score = 15; confirmed = true; side = 'long'; }
    else if (interpret === 'bearish_momentum') { score = -15; confirmed = true; side = 'short'; }
    return { name: 'MACD', score, confirmed, side, detail: interpret };
  }

  #checkVolume(indicators) {
    if (!indicators || !indicators.volume) return { name: 'Volume', score: 0, confirmed: false, side: 'neutral' };
    const { ratio, interpret } = indicators.volume;
    let score = 0, confirmed = false;
    if (ratio >= 1.5) { score = 10; confirmed = true; }
    else if (ratio >= 1.0) { score = 5; confirmed = true; }
    else if (ratio < 0.5) { score = -5; }
    return { name: 'Volume', score, confirmed, side: 'neutral', detail: interpret + ' (' + (ratio ? ratio.toFixed(2) : 'N/A') + ')' };
  }

  #checkPriceAction(closes, highs, lows) {
    if (!closes || closes.length < 5) return { name: 'PA', score: 0, confirmed: false, side: 'neutral' };
    const last5 = closes.slice(-5);
    const isHigherHighs = last5[4] > last5[3] && last5[3] > last5[2];
    const isLowerLows = last5[4] < last5[3] && last5[3] < last5[2];
    let score = 0, confirmed = false, side = 'neutral';
    if (isHigherHighs) { score = 10; confirmed = true; side = 'long'; }
    else if (isLowerLows) { score = -10; confirmed = true; side = 'short'; }
    return { name: 'PA', score, confirmed, side, detail: isHigherHighs ? 'Higher highs' : isLowerLows ? 'Lower lows' : 'Choppy' };
  }

  #checkMomentum(closes) {
    if (!closes || closes.length < 10) return { name: 'Momentum', score: 0, confirmed: false, side: 'neutral' };
    const current = closes[closes.length - 1];
    const prev = closes[closes.length - 5];
    const change = ((current - prev) / prev) * 100;
    let score = 0, confirmed = false, side = 'neutral';
    if (change > 0.5) { score = 10; confirmed = true; side = 'long'; }
    else if (change < -0.5) { score = -10; confirmed = true; side = 'short'; }
    return { name: 'Momentum', score, confirmed, side, detail: change.toFixed(2) + '%' };
  }

  #determineSide(results) {
    let longScore = 0, shortScore = 0;
    for (const r of results) {
      if (r.side === 'long') longScore += Math.abs(r.score);
      if (r.side === 'short') shortScore += Math.abs(r.score);
    }
    if (longScore > shortScore * 1.2) return 'long';
    if (shortScore > longScore * 1.2) return 'short';
    return 'neutral';
  }
}
