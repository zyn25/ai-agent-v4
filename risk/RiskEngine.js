import { PositionSizer } from './PositionSizer.js';
import { CircuitBreaker } from './CircuitBreaker.js';
export class RiskEngine {
  #config; #logger; #db; #breaker; #sizer;
  constructor(c,l,db) { this.#config=c; this.#logger=l; this.#db=db; this.#breaker=new CircuitBreaker(c,l,db); this.#sizer=new PositionSizer(c); }
  async canTrade() { const b=await this.#breaker.check(); if(!b.allowed)return b; const o=this.#db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='open'").get(); if((o?.c||0)>=this.#config.risk.maxOpenPositions)return{allowed:false,reason:'Max positions'}; return{allowed:true}; }
  calculatePositionSize(b,e,s) { return this.#sizer.calculate(b,e,s); }
  calculateLevels(e,a,side) { const sl=side==='long'?e-a*this.#config.indicators.atrSlMultiplier:e+a*this.#config.indicators.atrSlMultiplier; const tp=side==='long'?e+a*this.#config.indicators.atrTpMultiplier:e-a*this.#config.indicators.atrTpMultiplier; const be=side==='long'?e+a*this.#config.risk.breakEvenTrigger:e-a*this.#config.risk.breakEvenTrigger; return{stopLoss:sl,takeProfit:tp,breakEven:be}; }
  shouldBreakEven(c,e,be,s) { if(!be||!c||!e)return false; return s==='long'?c>=be:c<=be; }
  getTrailingStop(c,a,s) { if(!c||!a)return null; const d=a*this.#config.risk.trailingStopATR; return s==='long'?c-d:c+d; }
  async recordLoss() { await this.#breaker.recordLoss(); }
}
