import { PositionManager } from './PositionManager.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { EventEmitter } from 'events';

export class TradeManager extends EventEmitter {
  #config; #logger; #db; #exchange; #signalEngine; #riskEngine; #aiValidator; #eventBus;
  #pm; #posRepo; #portRepo; #running=false; #loop=null; #reconnect=0;

  constructor(c,l,db,ex,se,re,av,eb) {
    super(); this.#config=c; this.#logger=l; this.#db=db; this.#exchange=ex;
    this.#signalEngine=se; this.#riskEngine=re; this.#aiValidator=av; this.#eventBus=eb;
    this.#pm=new PositionManager(); this.#posRepo=new PositionRepository(db); this.#portRepo=new PortfolioRepository(db);
  }

  async initialize() {
    this.#portRepo.initialize(this.#config.trading.startingBalance);
    const open=this.#posRepo.findOpen(); open.forEach(p=>this.#pm.track(p));
    if(open.length) this.#logger.info('Restored '+open.length+' positions');
    this.#running=true;
    this.#loop=setInterval(async()=>{ if(!this.#running)return; try{await this.#tick();}catch(e){this.#logger.error('Loop:',e.message);} },60000);
    this.#logger.info('TradeManager initialized');
  }

  async #tick() {
    try { await this.#monitor(); this.#reconnect=0; }
    catch(e) { this.#logger.error('Monitor:',e.message); this.#reconnect++; if(this.#reconnect>=5){this.#logger.error('Exchange down. Pause 5min.');await this.#sleep(300000);this.#reconnect=0;} return; }
    const can=await this.#riskEngine.canTrade(); if(!can.allowed)return;
    const sig=await this.#signalEngine.analyze(); if(sig.side==='neutral')return;
    this.#logger.trade('Signal: '+sig.side+' | '+sig.confidence+'%');
    let ai={decision:'approve',confidence:sig.confidence};
    if(this.#config.ai.enabled) { ai=await this.#aiValidator.validate(sig); if(ai.decision!=='approve'){this.#logger.ai('Rejected: '+ai.reason);return;} }
    await this.#execute(sig,ai);
  }

  async #execute(sig,ai) {
    try {
      const tk=await this.#exchange.fetchTicker(this.#config.exchange.pair); const entry=tk.last;
      const atr=sig.indicators?.primary?.indicators?.atr?.value||entry*0.01;
      const lv=this.#riskEngine.calculateLevels(entry,atr,sig.side);
      const bal=this.#portRepo.getCurrent()?.balance||this.#config.trading.startingBalance;
      const sz=this.#riskEngine.calculatePositionSize(bal,entry,lv.stopLoss);
      if(sz.quantity<=0){this.#logger.warn('Qty 0');return;}
      if(sz.marginRequired>bal){this.#logger.warn('No margin');return;}
      const id='T-'+Date.now().toString(36)+'-'+Math.random().toString(36).substring(2,8);
      const pos={id:id.toUpperCase(),pair:this.#config.exchange.pair,side:sig.side,entry_price:entry,quantity:sz.quantity,leverage:sz.leverage,stop_loss:lv.stopLoss,take_profit:lv.takeProfit,status:'open',ai_confidence:ai.confidence,ai_decision:ai.decision,strategy_version:'v4',open_time:new Date().toISOString()};
      this.#posRepo.create(pos); this.#pm.track({...pos,break_even_price:lv.breakEven});
      this.#eventBus.emit('trade:opened',{...pos,riskAmount:sz.riskAmount,confidence:ai.confidence});
      this.#logger.trade('Opened: '+pos.id+' | '+sig.side+' @ '+entry);
    } catch(e) { this.#logger.error('Execute:',e.message); }
  }

  async #monitor() {
    const t=this.#pm.getAll(); if(!t.length)return;
    const tk=await this.#exchange.fetchTicker(this.#config.exchange.pair); const p=tk.last;
    for(const pos of t) { try{await this.#check(pos,p);}catch(e){this.#logger.error('Check '+pos.id+':',e.message);} }
  }

  async #check(pos,price) {
    const pnl=(pos.side==='long'?price-pos.entry_price:pos.entry_price-price)*pos.quantity;
    if(pos.side==='long'?price<=pos.stop_loss:price>=pos.stop_loss) { await this.#close(pos,price,'stop_loss',pnl); return; }
    if(pos.side==='long'?price>=pos.take_profit:price<=pos.take_profit) { await this.#close(pos,price,'take_profit',pnl); return; }
    if(Date.now()-new Date(pos.open_time).getTime()>this.#config.risk.maxHoldHours*3600000) { await this.#close(pos,price,'max_hold',pnl); return; }
    if(!pos.break_even_applied&&pos.break_even_price) {
      const be=this.#riskEngine.shouldBreakEven(price,pos.entry_price,pos.break_even_price,pos.side);
      if(be) { this.#pm.update(pos.id,{stop_loss:pos.entry_price,break_even_applied:true}); this.#posRepo.update(pos.id,{stop_loss:pos.entry_price,break_even_applied:1}); this.#logger.trade('BE: '+pos.id); }
    }
    const atr=Math.abs(pos.entry_price-pos.stop_loss)/this.#config.indicators.atrSlMultiplier;
    const ts=this.#riskEngine.getTrailingStop(price,atr,pos.side);
    if(pos.trailing_stop&&((pos.side==='long'&&price<=pos.trailing_stop)||(pos.side==='short'&&price>=pos.trailing_stop))) { await this.#close(pos,price,'trailing_stop',pnl); return; }
    if(ts&&(!pos.trailing_stop||(pos.side==='long'&&ts>pos.trailing_stop)||(pos.side==='short'&&ts<pos.trailing_stop))) { this.#pm.update(pos.id,{trailing_stop:ts}); this.#posRepo.update(pos.id,{trailing_stop:ts}); }
  }

  async #close(pos,price,reason,pnl) {
    const fees=price*pos.quantity*0.0004; const slip=price*pos.quantity*0.0001;
    const net=pnl-fees-slip;
    const roi=pos.entry_price>0&&pos.quantity>0?(net/(pos.entry_price*pos.quantity))*100:0;
    const hold=Date.now()-new Date(pos.open_time).getTime();
    this.#posRepo.closePosition(pos.id,price,net,roi,fees,slip,reason,hold);
    this.#portRepo.updateBalance(net,net>0); this.#portRepo.updateWinRate();
    this.#pm.remove(pos.id);
    if(net<=0) await this.#riskEngine.recordLoss();
    this.#eventBus.emit('trade:closed',{...pos,exitPrice:price,pnl:net,roi,reason,fees,slippage:slip,holdDuration:hold});
    this.#logger.trade('Closed: '+pos.id+' | '+reason+' | $'+net.toFixed(2));
  }

  #sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
  async shutdown() { this.#running=false; if(this.#loop){clearInterval(this.#loop);this.#loop=null;} this.#logger.info('TradeManager shutdown'); }
  getOpenPositions() { return this.#pm.getAll(); }
  getPortfolio() { return this.#portRepo.getCurrent(); }
}
