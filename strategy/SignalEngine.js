import { EMAIndicator } from './indicators/EMA.js';
import { RSIIndicator } from './indicators/RSI.js';
import { MACDIndicator } from './indicators/MACD.js';
import { ATRIndicator } from './indicators/ATR.js';
import { VolumeIndicator } from './indicators/Volume.js';
import { TrendFilter } from './TrendFilter.js';
import { SIDE } from '../utils/constants.js';

export class SignalEngine {
  #config; #logger; #marketData;
  constructor(config, logger, marketData) { this.#config=config; this.#logger=logger; this.#marketData=marketData; }

  async analyze() {
    try {
      const {primary,secondary,tertiary}=this.#config.timeframes;
      const [pd,sd,td]=await Promise.all([this.#fetch(primary),this.#fetch(secondary),this.#fetch(tertiary)]);
      if(!pd||!sd||!td) return {side:'neutral',confidence:0,reason:'Data fetch failed'};
      const ps=this.#calc(pd,50),ss=this.#calc(sd,30),ts=this.#calc(td,20);
      if(!ps||!ss||!ts) return {side:'neutral',confidence:0,reason:'Indicator calc failed'};
      const mtf=ps.score+ss.score+ts.score;
      if(!TrendFilter.checkAlignment(ps.trend,ss.trend,ts.trend)) return {side:'neutral',confidence:0,reason:'Timeframes not aligned'};
      const side=mtf>0?SIDE.LONG:SIDE.SHORT;
      const confidence=Math.min(Math.abs(mtf),100);
      if(confidence<this.#config.indicators.confidenceThreshold) return {side:'neutral',confidence,reason:'Below threshold'};
      return {side,confidence,reason:'Signal generated',indicators:{primary:ps,secondary:ss,tertiary:ts}};
    } catch(e) { this.#logger.error('Signal error:',e.message); return {side:'neutral',confidence:0,reason:e.message}; }
  }

  async #fetch(tf) {
    try {
      const ohlcv=await this.#marketData.fetchOHLCV(tf,200);
      if(!ohlcv||ohlcv.length<50) return null;
      return {opens:ohlcv.map(c=>c[1]),highs:ohlcv.map(c=>c[2]),lows:ohlcv.map(c=>c[3]),closes:ohlcv.map(c=>c[4]),volumes:ohlcv.map(c=>c[5])};
    } catch(e) { this.#logger.warn('Fetch '+tf+' failed:',e.message); return null; }
  }

  #calc(d,w) {
    try {
      const {closes,highs,lows,volumes}=d;
      const ind=this.#config.indicators;
      const ef=EMAIndicator.calculate(closes,ind.emaFast),es=EMAIndicator.calculate(closes,ind.emaSlow);
      if(!ef.length||!es.length) return null;
      const ec=EMAIndicator.crossover(ef,es);
      const rv=RSIIndicator.calculate(closes,ind.rsiPeriod);
      if(!rv.length) return null;
      const ri=RSIIndicator.interpret(rv[rv.length-1],ind.rsiOverbought,ind.rsiOversold);
      const mc=MACDIndicator.calculate(closes,ind.macdFast,ind.macdSlow,ind.macdSignal);
      const mi=mc.histogram?MACDIndicator.interpret(mc.MACD,mc.signal,mc.histogram):'neutral';
      const av=ATRIndicator.calculate(highs,lows,closes,ind.atrPeriod);
      const vd=VolumeIndicator.calculate(volumes),vi=VolumeIndicator.interpret(vd.ratio);
      let score=0;
      if(ec==='bullish'||ec==='above')score+=w*0.3;else if(ec==='bearish'||ec==='below')score-=w*0.3;
      if(ri==='bullish')score+=w*0.2;else if(ri==='bearish')score-=w*0.2;
      if(mi.includes('bullish'))score+=w*0.25;else if(mi.includes('bearish'))score-=w*0.25;
      if(vi==='high'||vi==='very_high')score*=1.1;else if(vi==='low')score*=0.7;
      return {score,trend:score>0?'bullish':score<0?'bearish':'neutral',weight:w,indicators:{ema:{fast:ef[ef.length-1],slow:es[es.length-1],cross:ec},rsi:{value:rv[rv.length-1],interpret:ri},macd:{interpret:mi},atr:{value:av[av.length-1]},volume:{ratio:vd.ratio,interpret:vi}}};
    } catch(e) { this.#logger.warn('Calc error:',e.message); return null; }
  }
}
