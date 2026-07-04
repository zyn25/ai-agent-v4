import { EMAIndicator } from './indicators/EMA.js';

export class TrendStrength {
  #config; #logger;
  
  constructor(config, logger) { 
    this.#config = config; 
    this.#logger = logger; 
  }

  analyze(closes) {
    // Guard 1: Butuh minimal 100 candle untuk menghitung EMA100 dengan aman
    if (!closes || closes.length < 100) {
      return { strength: 0, direction: 'unknown', tradeable: false };
    }

    const ema20 = EMAIndicator.calculate(closes, 20);
    const ema50 = EMAIndicator.calculate(closes, 50);
    const ema100 = EMAIndicator.calculate(closes, 100);

    if (!ema20.length || !ema50.length || !ema100.length) {
      return { strength: 0, direction: 'unknown', tradeable: false };
    }

    const e20 = ema20[ema20.length - 1];
    const e50 = ema50[ema50.length - 1];
    const e100 = ema100[ema100.length - 1];
    const price = closes[closes.length - 1];

    let score = 0;

    // 1. EMA alignment (0-40 points)
    // Bullish/Bearish Sempurna dapat 40 Poin
    // Jika market sedang kayah (messy) tidak dapat poin (0)
    if (e20 > e50 && e50 > e100) score += 40;
    else if (e20 < e50 && e50 < e100) score += 40;

    // 2. Price vs EMA (0-30 points)
    // Guard 2: Anti Divide by Zero
    const distFromEma50 = e50 !== 0 ? Math.abs((price - e50) / e50) * 100 : 0;
    if (distFromEma50 > 2) score += 30;
    else if (distFromEma50 > 1) score += 20;
    else score += 5;

    // 3. EMA spread (0-30 points)
    // Guard 3: Anti Divide by Zero
    const emaSpread = e50 !== 0 ? Math.abs((e20 - e50) / e50) * 100 : 0;
    if (emaSpread > 1) score += 30;
    else if (emaSpread > 0.5) score += 20;
    else score += 5;

    // Determinasi arah
    const direction = e20 > e50 ? 'bullish' : e20 < e50 ? 'bearish' : 'neutral';
    
    // Threshold 60 agar hanya trenValid yang lolos
    const tradeable = score >= 60;

    return { 
      strength: score, 
      direction, 
      tradeable, 
      emaSpread: emaSpread.toFixed(2) 
    };
  }
}
