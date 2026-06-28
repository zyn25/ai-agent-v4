import { PositionManager } from './PositionManager.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { OrderbookAnalyzer } from '../strategy/OrderbookAnalyzer.js';
import { EventEmitter } from 'events';

export class TradeManager extends EventEmitter {
  #config; #logger; #db; #exchange; #signalEngine; #riskEngine; #aiValidator; #eventBus;
  #pm; #posRepo; #portRepo; #orderbook; #running=false; #loop=null; #reconnect=0;
  #paused=false; #pauseReason=''; #lastTradeTime=0;

  constructor(c,l,db,ex,se,re,av,eb) {
    super(); this.#config=c; this.#logger=l; this.#db=db; this.#exchange=ex;
    this.#signalEngine=se; this.#riskEngine=re; this.#aiValidator=av; this.#eventBus=eb;
    this.#pm=new PositionManager(); this.#posRepo=new PositionRepository(db);
    this.#portRepo=new PortfolioRepository(db); this.#orderbook=new OrderbookAnalyzer(ex,l);
  }

  async initialize() {
    this.#portRepo.initialize(this.#config.trading.startingBalance);
    const open=this.#posRepo.findOpen(); open.forEach(p=>this.#pm.track(p));
    if(open.length) this.#logger.info('Restored '+open.length+' positions');
    this.#running=true;
    this.#loop=setInterval(async()=>{ if(!this.#running||this.#paused)return; try{await this.#tick();}catch(e){this.#logger.error('Loop:',e.message);} },60000);
    this.#startEquityTracking();
    this.#logger.info('TradeManager initialized (pairs: '+this.#config.pairs.join(', ')+')');
  }

  #startEquityTracking() {
    setInterval(()=>{
      try {
        const p=this.#portRepo.getCurrent(); if(!p) return;
        const open=this.#posRepo.findOpen();
        let unrealized=0;
        for(const pos of open) { unrealized+=(pos.unrealized_pnl||0); }
        const equity=p.balance+unrealized;
        const peak=Math.max(p.peak_balance||p.balance, equity);
        const dd=peak>0?((peak-equity)/peak)*100:0;
        this.#db.prepare('INSERT INTO equity_curve (balance,equity,drawdown,drawdown_pct,peak_balance,open_positions) VALUES (?,?,?,?,?,?)').run(p.balance,equity,peak-equity,dd,peak,open.length);
      } catch(e){}
    }, 3600000);
  }

  // Emergency
  pause(reason) { this.#paused=true; this.#pauseReason=reason||'Manual'; this.#logger.warn('PAUSED: '+this.#pauseReason); this.#eventBus.emit('trade:paused',{reason:this.#pauseReason}); }
  resume() { this.#paused=false; this.#pauseReason=''; this.#logger.info('RESUMED'); this.#eventBus.emit('trade:resumed',{}); }
  get isPaused() { return this.#paused; }
  get pauseReason() { return this.#pauseReason; }

  async closeAll(reason) {
    const open=this.#pm.getAll();
    this.#logger.warn('EMERGENCY: Closing '+open.length+' positions');
    for(const pos of open) {
      try {
        const tk=await this.#exchange.fetchTicker(pos.pair);
        const pnl=(pos.side==='long'?tk.last-pos.entry_price:pos.entry_price-tk.last)*(pos.remaining_quantity||pos.quantity);
        await this.#close(pos,tk.last,'emergency_'+reason,pnl);
      } catch(e) { this.#logger.error('Close error '+pos.id); }
    }
    this.pause('Emergency: '+reason);
  }

  async closeLast(reason) {
    const open=this.#pm.getAll();
    if(!open.length) return;
    const pos=open[open.length-1];
    try {
      const tk=await this.#exchange.fetchTicker(pos.pair);
      const pnl=(pos.side==='long'?tk.last-pos.entry_price:pos.entry_price-tk.last)*(pos.remaining_quantity||pos.quantity);
      await this.#close(pos,tk.last,'manual_close',pnl);
    } catch(e) { this.#logger.error('Close last error'); }
  }

  async #tick() {
    try { await this.#monitor(); this.#reconnect=0; }
    catch(e) { this.#logger.error('Monitor:',e.message); this.#reconnect++; if(this.#reconnect>=5){await this.#sleep(300000);this.#reconnect=0;} return; }

    const cooldownMs=this.#config.risk.cooldownMinutes*60000;
    if(Date.now()-this.#lastTradeTime<cooldownMs) return;

    const can=await this.#riskEngine.canTrade(); if(!can.allowed)return;

    const signals=await this.#signalEngine.analyzeAll();
    if(!signals.length) return;

    signals.sort((a,b) => b.confidence - a.confidence);
    const best=signals[0];
    this.#logger.trade('Signal: '+best.pair+' '+best.side+' | '+best.confidence+'%');

    // Orderbook validation
    const ob=await this.#orderbook.analyze(best.pair);
    const obDecision=this.#orderbook.validateSignal(best,ob);
    if(obDecision==='reject') {
      this.#logger.trade('Orderbook REJECTED: '+best.pair);
      return;
    }
    if(obDecision==='caution') {
      this.#logger.trade('Orderbook CAUTION: '+best.pair+' (reducing size)');
    }

    let ai={decision:'approve',confidence:best.confidence};
    if(this.#config.ai.enabled) {
      ai=await this.#aiValidator.validate(best);
      if(ai.decision!=='approve'){this.#logger.ai('Rejected: '+ai.reason);return;}
    }
    await this.#execute(best,ai,obDecision);
  }

  async #execute(sig,ai,obDecision) {
    try {
      const tk=await this.#exchange.fetchTicker(sig.pair); const entry=tk.last;
      const atr=sig.indicators?.primary?.indicators?.atr?.value||entry*0.01;
      const lv=this.#riskEngine.calculateLevels(entry,atr,sig.side);
      const bal=this.#portRepo.getCurrent()?.balance||this.#config.trading.startingBalance;

      // Use Kelly sizing if enough trades
      const closedTrades=this.#db.prepare("SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 50").all();
      const sz=this.#riskEngine.calculatePositionSize(bal,entry,lv.stopLoss);

      // Reduce size if orderbook caution
      if(obDecision==='caution') {
        sz.quantity=sz.quantity*0.5;
        sz.riskAmount=sz.riskAmount*0.5;
      }

      if(sz.quantity<=0||sz.marginRequired>bal){this.#logger.warn('Skip: sizing');return;}
      const id='T-'+Date.now().toString(36)+'-'+Math.random().toString(36).substring(2,8);
      const pos={id:id.toUpperCase(),pair:sig.pair,side:sig.side,entry_price:entry,quantity:sz.quantity,leverage:sz.leverage,stop_loss:lv.stopLoss,take_profit:lv.takeProfit,status:'open',ai_confidence:ai.confidence,ai_decision:ai.decision,strategy_version:'v4',open_time:new Date().toISOString()};
      this.#posRepo.create(pos);
      this.#pm.track({...pos,break_even_price:lv.breakEven,partial_tp_index:0,remaining_quantity:sz.quantity});
      this.#lastTradeTime=Date.now();
      this.#eventBus.emit('trade:opened',{...pos,riskAmount:sz.riskAmount,confidence:ai.confidence});
      this.#logger.trade('Opened: '+pos.id+' | '+sig.pair+' '+sig.side+' @ '+entry+' | OB:'+obDecision);
    } catch(e) { this.#logger.error('Execute:',e.message); }
  }

  async #monitor() {
    const t=this.#pm.getAll(); if(!t.length)return;
    for(const pos of t) {
      try {
        const tk=await this.#exchange.fetchTicker(pos.pair);
        await this.#check(pos,tk.last);
      } catch(e) { this.#logger.error('Check '+pos.id+':',e.message); }
    }
  }

  async #check(pos,price) {
    const qty=pos.remaining_quantity||pos.quantity;
    const pnl=(pos.side==='long'?price-pos.entry_price:pos.entry_price-price)*qty;
    if(pos.side==='long'?price<=pos.stop_loss:price>=pos.stop_loss) { await this.#close(pos,price,'stop_loss',pnl); return; }
    if(Date.now()-new Date(pos.open_time).getTime()>this.#config.risk.maxHoldHours*3600000) { await this.#close(pos,price,'max_hold',pnl); return; }

    const ptpIndex=pos.partial_tp_index||0;
    const ptp=this.#riskEngine.shouldPartialTP(price,pos.entry_price,pos.side,ptpIndex);
    if(ptp) {
      const closeQty=qty*(ptp.sizePercent/100);
      if(closeQty>0.0001) {
        const closePnl=(pos.side==='long'?price-pos.entry_price:pos.entry_price-price)*closeQty;
        const fees=closeQty*price*0.0004; const slip=closeQty*price*0.0001;
        const net=closePnl-fees-slip; const remaining=qty-closeQty; const newIdx=ptpIndex+1;
        this.#pm.update(pos.id,{remaining_quantity:remaining,partial_tp_index:newIdx});
        this.#posRepo.partialClose(pos.id,closeQty,net,fees,slip,remaining,newIdx);
        this.#portRepo.updateBalance(net);
        this.#eventBus.emit('trade:partial_close',{...pos,closePrice:price,closeQty,pnl:net,level:newIdx,remaining});
        this.#logger.trade('PTP#'+newIdx+': '+pos.id+' | $'+net.toFixed(2)+' | Rem: '+remaining.toFixed(4));
        if(newIdx===1) { this.#pm.update(pos.id,{stop_loss:pos.entry_price,break_even_applied:true}); this.#posRepo.update(pos.id,{stop_loss:pos.entry_price,break_even_applied:1}); }
        if(remaining<=0.0001) { await this.#close(pos,price,'all_tp',0); return; }
      }
    }

    if(pos.side==='long'?price>=pos.take_profit:price<=pos.take_profit) { await this.#close(pos,price,'take_profit',pnl); return; }
    if(!pos.break_even_applied&&pos.break_even_price&&this.#riskEngine.shouldBreakEven(price,pos.entry_price,pos.break_even_price,pos.side)) {
      this.#pm.update(pos.id,{stop_loss:pos.entry_price,break_even_applied:true}); this.#posRepo.update(pos.id,{stop_loss:pos.entry_price,break_even_applied:1});
    }
    const atr=Math.abs(pos.entry_price-pos.stop_loss)/this.#config.indicators.atrSlMultiplier;
    const ts=this.#riskEngine.getTrailingStop(price,atr,pos.side);
    if(pos.trailing_stop&&((pos.side==='long'&&price<=pos.trailing_stop)||(pos.side==='short'&&price>=pos.trailing_stop))) { await this.#close(pos,price,'trailing_stop',pnl); return; }
    if(ts&&(!pos.trailing_stop||(pos.side==='long'&&ts>pos.trailing_stop)||(pos.side==='short'&&ts<pos.trailing_stop))) { this.#pm.update(pos.id,{trailing_stop:ts}); this.#posRepo.update(pos.id,{trailing_stop:ts}); }
  }

  async #close(pos,price,reason,pnl) {
    const qty=pos.remaining_quantity||pos.quantity;
    const fees=price*qty*0.0004; const slip=price*qty*0.0001;
    const net=pnl-fees-slip;
    const roi=pos.entry_price>0&&qty>0?(net/(pos.entry_price*qty))*100:0;
    const hold=Date.now()-new Date(pos.open_time).getTime();
    this.#posRepo.closePosition(pos.id,price,net,roi,fees,slip,reason,hold);
    this.#portRepo.updateBalance(net); this.#portRepo.updateWinRate();
    this.#pm.remove(pos.id);
    if(net<=0) await this.#riskEngine.recordLoss();
    this.#eventBus.emit('trade:closed',{...pos,exitPrice:price,pnl:net,roi,reason,fees,slippage:slip,holdDuration:hold});
    this.#logger.trade('Closed: '+pos.id+' | '+reason+' | $'+net.toFixed(2));
  }

  #sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
  async shutdown() { this.#running=false; if(this.#loop){clearInterval(this.#loop);this.#loop=null;} this.#logger.info('TradeManager shutdown'); }
  getOpenPositions() { return this.#pm.getAll(); }
  getPortfolio() { return this.#portRepo.getCurrent(); }
  getLastTradeTime() { return this.#lastTradeTime; }
  get orderbook() { return this.#orderbook; }
}
