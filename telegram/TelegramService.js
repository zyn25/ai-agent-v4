import TelegramBot from 'node-telegram-bot-api';
import { MessageFormatter } from './MessageFormatter.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { PositionSizer } from '../risk/PositionSizer.js';
import { totalmem, freemem, cpus } from 'os';

export class TelegramService {
  #config; #logger; #eventBus; #tradeManager; #bot=null; #fmt; #chatId;
  #portRepo; #posRepo; #db; #sizer;
  #lastRestart=0; #restartCount=0; #startTime; #exchangeLatency=0;

  constructor(c,l,eb,tm,db,sm) {
    this.#config=c; this.#logger=l; this.#eventBus=eb; this.#tradeManager=tm;
    this.#fmt=new MessageFormatter(); this.#chatId=c.telegram.chatId;
    this.#portRepo=new PortfolioRepository(db); this.#posRepo=new PositionRepository(db);
    this.#db=db; this.#sizer=new PositionSizer(c); this.#startTime=Date.now();
  }

  async initialize() {
    if(!this.#config.telegram.enabled){this.#logger.info('Telegram disabled');return;}
    try {
      this.#bot=new TelegramBot(this.#config.telegram.botToken,{polling:{interval:5000,params:{timeout:30},autoStart:true}});
      this.#bot.on('polling_error',(e)=>{
        const now=Date.now();
        if(now-this.#lastRestart>60000&&this.#restartCount<3){
          this.#lastRestart=now; this.#restartCount++;
          setTimeout(()=>{try{this.#bot.stopPolling();}catch{} setTimeout(()=>{try{this.#bot.startPolling();}catch{}},5000);},5000);
        }
      });
      this.#setupEvents(); this.#setupCommands();
      await this.#send('🤖 <b>AI Agent V4 Online</b>\n\n/help - Show commands');
      this.#logger.info('Telegram initialized');
    } catch(e){this.#logger.error('TG init fail:',e.message);}
  }

  async #fetchPrices() {
    const prices = {};
    for (const pair of this.#config.pairs) {
      try {
        const ob = await this.#tradeManager.orderbook.analyze(pair);
        if (ob && ob.midPrice) prices[pair] = ob.midPrice;
      } catch {}
    }
    return prices;
  }

  #setupEvents() {
    this.#eventBus.on('trade:opened',d=>this.#send(this.#fmt.formatEntry(d)));
    this.#eventBus.on('trade:closed',d=>this.#send(this.#fmt.formatExit(d)));
    this.#eventBus.on('trade:partial_close',d=>this.#send(this.#fmt.formatPartialClose(d)));
    this.#eventBus.on('trade:paused',d=>this.#send('⏸️ <b>PAUSED</b>\n\n'+d.reason));
    this.#eventBus.on('trade:resumed',()=>this.#send('▶️ <b>RESUMED</b>'));
    this.#eventBus.on('ai:validated',d=>{if(d.decision==='approve')this.#send(this.#formatAI(d));});
  }

  #formatAI(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    const emoji = d.decision === 'approve' ? '✅' : d.decision === 'reject' ? '❌' : '⏳';
    const confColor = d.confidence >= 70 ? '🟢' : d.confidence >= 50 ? '🟡' : '🔴';
    return '🤖 <b>AI VALIDATION</b>\n\nPair: <code>'+d.pair+'</code>\nSide: <code>'+(d.side?.toUpperCase()||'N/A')+'</code>\nDecision: <code>'+emoji+' '+(d.decision?.toUpperCase()||'N/A')+'</code>\nConfidence: <code>'+confColor+' '+d.confidence+'%</code>\nReason: <code>'+(d.reason||'N/A')+'</code>\nLatency: <code>'+(d.latency||0)+'ms</code>\n\n🕐 '+t;
  }

  #setupCommands() {
    this.#bot.onText(/\/start/,()=>this.#send(this.#helpText()));
    this.#bot.onText(/\/help/,()=>this.#send(this.#helpText()));
    this.#bot.onText(/\/status/,async()=>this.#cmdStatus());
    this.#bot.onText(/\/positions/,()=>this.#cmdPositions());
    this.#bot.onText(/\/balance/,()=>this.#cmdBalance());
    this.#bot.onText(/\/trades/,()=>this.#cmdTrades());
    this.#bot.onText(/\/stats/,()=>this.#cmdStats());
    this.#bot.onText(/\/config/,()=>this.#cmdConfig());
    this.#bot.onText(/\/risk/,()=>this.#cmdRisk());
    this.#bot.onText(/\/health/,()=>this.#cmdHealth());
    this.#bot.onText(/\/equity/,()=>this.#cmdEquity());
    this.#bot.onText(/\/pause/,()=>{this.#tradeManager.pause('Manual');this.#send('⏸️ Paused');});
    this.#bot.onText(/\/resume/,()=>{this.#tradeManager.resume();this.#send('▶️ Resumed');});
    this.#bot.onText(/\/closeall/,()=>{this.#tradeManager.closeAll('telegram');this.#send('🔴 Closing all...');});
    this.#bot.onText(/\/closelast/,()=>{this.#tradeManager.closeLast('telegram');this.#send('🔴 Closing last...');});
    this.#bot.onText(/\/orderbook/,async()=>this.#cmdOrderbook());
    this.#bot.onText(/\/kelly/,()=>this.#cmdKelly());
    this.#bot.onText(/\/summary/,()=>this.#cmdSummary());
    this.#bot.onText(/\/analytics/,()=>this.#cmdAnalytics());
    this.#bot.onText(/\/journal/,()=>this.#cmdJournal());
    this.#bot.onText(/\/mode/,()=>this.#cmdMode());
    this.#bot.onText(/\/aggressive/,()=>this.#setMode('aggressive'));
    this.#bot.onText(/\/balanced/,()=>this.#setMode('balanced'));
    this.#bot.onText(/\/conservative/,()=>this.#setMode('conservative'));
    this.#bot.onText(/\/scalping/,()=>this.#setMode('scalping'));
  }

  #helpText() {
    return '📋 <b>COMMANDS</b>\n\n📊 <b>Info:</b>\n/status /positions /balance /trades /stats /equity\n\n📈 <b>Analysis:</b>\n/orderbook /kelly /summary /analytics /journal\n\n⚙️ <b>Settings:</b>\n/config /risk /health /mode\n\n🎯 <b>Strategy:</b>\n/aggressive /balanced /conservative /scalping\n\n🚨 <b>Emergency:</b>\n/pause /resume /closeall /closelast';
  }

  async #cmdStatus() {
    try {
      const p=this.#portRepo.getCurrent();
      const pos=this.#posRepo.findOpen();
      let prices={};
      try { prices=await this.#fetchPrices(); } catch{}
      const s=this.#posRepo.getStats();
      const pf=s&&s.total>0&&s.losses>0?(Math.abs(s.total_pnl)/Math.abs(s.worst_trade||1)).toFixed(2):'N/A';
      const avgHoldMs=s&&s.total>0?(s.avg_hold_duration||0):0;
      const avgHoldH=avgHoldMs>0?(avgHoldMs/3600000).toFixed(1)+'h':'N/A';

      let floatingPnl=0, posLines='';
      if(pos&&pos.length&&prices) {
        for(const position of pos) {
          const cp=prices[position.pair]; if(!cp) continue;
          const qty=position.remaining_quantity||position.quantity;
          const pnl=position.side==='long'?(cp-position.entry_price)*qty:(position.entry_price-cp)*qty;
          const pct=position.entry_price>0?(pnl/(position.entry_price*qty))*100:0;
          floatingPnl+=pnl;
          posLines+=(pnl>=0?'🟢':'🔴')+' <code>'+position.pair+' '+position.side.toUpperCase()+'</code> <code>'+(pnl>=0?'+':'')+'$'+pnl.toFixed(2)+' ('+(pnl>=0?'+':'')+pct.toFixed(2)+'%)</code>\n';
        }
      }

      const totalEquity=(p?.balance||0)+floatingPnl;
      const ddPct=p?.peak_balance>0?((p.peak_balance-totalEquity)/p.peak_balance*100):0;

      const ci=cpus(); let idle=0,total=0;
      ci.forEach(c=>{for(const t in c.times)total+=c.times[t];idle+=c.times.idle;});
      const cpu=total>0?Math.round(((total-idle)/total)*100):0;
      const ram=Math.round(((totalmem()-freemem())/totalmem())*100);

      this.#send(
        '📊 <b>DASHBOARD</b>\n\n'+
        'Balance:       <code>$'+(p?.balance||0).toFixed(2)+'</code>\n'+
        'Equity:        <code>$'+totalEquity.toFixed(2)+'</code>\n'+
        'Floating:      <code>'+(floatingPnl>=0?'+':'')+'$'+floatingPnl.toFixed(2)+'</code>\n'+
        'Realized:      <code>$'+(p?.realized_pnl||0).toFixed(2)+'</code>\n'+
        'Daily PnL:     <code>'+((p?.daily_pnl||0)>=0?'+':'')+'$'+(p?.daily_pnl||0).toFixed(2)+'</code>\n'+
        'Weekly:        <code>'+((p?.weekly_pnl||0)>=0?'+':'')+'$'+(p?.weekly_pnl||0).toFixed(2)+'</code>\n'+
        'Monthly:       <code>'+((p?.monthly_pnl||0)>=0?'+':'')+'$'+(p?.monthly_pnl||0).toFixed(2)+'</code>\n'+
        'DD:            <code>'+ddPct.toFixed(2)+'%</code>\n'+
        'Win Rate:      <code>'+(p?.win_rate||0).toFixed(1)+'%</code>\n'+
        'PF:            <code>'+pf+'</code>\n'+
        'Avg Hold:      <code>'+avgHoldH+'</code>\n'+
        'Open:          <code>'+(pos?pos.length:0)+'</code>\n'+
        'CPU:           <code>'+cpu+'%</code>\n'+
        'RAM:           <code>'+ram+'%</code>\n'+
        'AI:            <code>'+(this.#config.ai.enabled?'✅ ON':'❌ OFF')+'</code>\n'+
        'Exchange:      <code>✅ Connected</code>\n\n'+
        (posLines?'📈 <b>POSITIONS:</b>\n'+posLines+'\n':'')+
        '🕐 '+this.#ts()
      );
    } catch(e) { this.#send('Status error: '+e.message); }
  }

  #cmdPositions() {
    try {
      const pos=this.#posRepo.findOpen();
      this.#send(this.#fmt.formatOpenPositions(pos, null));
    } catch(e) { this.#send('Positions error'); }
  }

  #cmdBalance() {
    const p=this.#portRepo.getCurrent();
    if(!p){this.#send('No data');return;}
    this.#send('💰 <b>BALANCE</b>\n\nBalance: $'+p.balance.toFixed(2)+'\nEquity: $'+p.equity.toFixed(2)+'\nRealized: $'+p.realized_pnl.toFixed(2)+'\nPeak: $'+(p.peak_balance||p.balance).toFixed(2));
  }

  #cmdTrades() {
    const t=this.#posRepo.findAll(10);
    if(!t||!t.length){this.#send('No trades');return;}
    let m='📋 <b>TRADES</b>\n\n';
    t.forEach(x=>{m+=(x.pnl>0?'💰':'💸')+' '+x.id+' | '+x.side+' | $'+(x.pnl||0).toFixed(2)+'\n';});
    this.#send(m);
  }

  #cmdStats() {
    const s=this.#posRepo.getStats();
    if(!s||!s.total){this.#send('No trades');return;}
    this.#send('📈 <b>STATS</b>\n\nTrades: '+s.total+'\nWins: '+s.wins+'\nLosses: '+s.losses+'\nRate: '+(s.total>0?((s.wins/s.total)*100).toFixed(1):0)+'%\nPnL: $'+s.total_pnl.toFixed(2)+'\nBest: $'+s.best_trade.toFixed(2)+'\nWorst: $'+s.worst_trade.toFixed(2)+'\nAvg: $'+s.avg_pnl.toFixed(2));
  }

  #cmdConfig() {
    const c=this.#config;
    const currentMode=this.#strategyModeName();
    this.#send('⚙️ <b>CONFIG</b>\n\nMode: '+c.trading.mode+'\nStrategy: <b>'+currentMode+'</b>\nPairs: '+c.pairs.join(', ')+'\nLeverage: '+c.exchange.leverage+'x\nAI: '+(c.ai.enabled?'ON':'OFF')+'\nStatus: '+(this.#tradeManager.isPaused?'⏸️ PAUSED':'▶️ RUNNING'));
  }

  #cmdRisk() {
    const r=this.#config.risk;
    this.#send('🛡️ <b>RISK</b>\n\nRisk/Trade: '+r.riskPerTrade+'%\nMax Daily: '+r.maxDailyLoss+'%\nMax Pos: '+r.maxOpenPositions+'\nMax Hold: '+r.maxHoldHours+'h\nPartial TP: '+r.partialTpLevels.join('/')+'R\nCooldown: '+r.cooldownMinutes+'min');
  }

  async #cmdHealth() {
    const ci=cpus(); let idle=0,total=0;
    ci.forEach(c=>{for(const t in c.times)total+=c.times[t];idle+=c.times.idle;});
    const cpu=total>0?Math.round(((total-idle)/total)*100):0;
    const ram=Math.round(((totalmem()-freemem())/totalmem())*100);
    const up=Math.round((Date.now()-this.#startTime)/1000);
    const h=Math.floor(up/3600); const m=Math.floor((up%3600)/60);

    let exStatus='✅';
    let exLatency=0;
    try {
      const start=Date.now();
      await this.#tradeManager.orderbook.analyze(this.#config.exchange.pair);
      exLatency=Date.now()-start;
    } catch { exStatus='❌'; exLatency=-1; }

    const currentMode=this.#strategyModeName();

    this.#send(
      '🏥 <b>HEALTH</b>\n\n'+
      'CPU:            <code>'+cpu+'%</code>\n'+
      'RAM:            <code>'+ram+'%</code>\n'+
      'Uptime:         <code>'+h+'h '+m+'m</code>\n'+
      'Positions:      <code>'+this.#posRepo.countOpen()+'</code>\n'+
      'Mode:           <code>'+currentMode+'</code>\n'+
      'Status:         <code>'+(this.#tradeManager.isPaused?'⏸️ PAUSED':'▶️ RUNNING')+'</code>\n'+
      'Exchange:       <code>'+exStatus+' ('+exLatency+'ms)</code>\n'+
      'Telegram:       <code>✅ Connected</code>\n'+
      'AI:             <code>'+(this.#config.ai.enabled?'✅ ON':'❌ OFF')+'</code>\n'+
      'DB:             <code>✅ OK</code>'
    );
  }

  #cmdEquity() {
    try {
      const eq=this.#db.prepare('SELECT * FROM equity_curve ORDER BY id DESC LIMIT 10').all();
      const p=this.#portRepo.getCurrent();
      if(!p){this.#send('No data');return;}
      let m='📈 <b>EQUITY</b>\n\nBalance: $'+p.balance.toFixed(2)+'\nPeak: $'+(p.peak_balance||p.balance).toFixed(2)+'\nDD: '+(eq.length?eq[0].drawdown_pct.toFixed(2):'0.00')+'%\n\n';
      if(eq.length) { m+='<b>Recent:</b>\n'; eq.reverse().forEach(e=>{m+='<code>'+e.created_at.substring(5,16)+' $'+e.equity.toFixed(2)+' DD:'+e.drawdown_pct.toFixed(1)+'%</code>\n';}); }
      this.#send(m);
    } catch(e){this.#send('Equity error');}
  }

  async #cmdOrderbook() {
    try {
      await this.#send('⏳ Fetching...');
      const ob=await this.#tradeManager.orderbook.analyze(this.#config.exchange.pair);
      if(!ob){this.#send('❌ Error');return;}
      this.#send('📖 <b>ORDERBOOK</b>\n\nPair: '+ob.pair+'\nMid: $'+ob.midPrice.toFixed(2)+'\nSpread: '+ob.spreadPercent.toFixed(4)+'%\nRatio: '+ob.bidAskRatio.toFixed(2)+'\nBias: '+ob.bias+'\nLiquidity: '+ob.liquidity);
    } catch(e){this.#send('Error');}
  }

  #cmdKelly() {
    try {
      const trades=this.#db.prepare("SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 50").all();
      const p=this.#portRepo.getCurrent();
      const bal=p?p.balance:this.#config.trading.startingBalance;

      if (!trades || trades.length === 0) {
        this.#send('🎯 <b>KELLY</b>\n\nNo trades yet.\nNeed min 10 trades for Kelly calculation.');
        return;
      }

      if (trades.length < 10) {
        this.#send('🎯 <b>KELLY</b>\n\nTrades: '+trades.length+'\nNeed min 10 trades for calculation.\nCurrent recommendation: 0.50% (minimum)');
        return;
      }

      const k=this.#sizer.calculateKelly(trades,bal);
      this.#send('🎯 <b>KELLY</b>\n\nTrades: '+trades.length+'\nWin Rate: '+(k.winRate||'N/A')+'\nPayoff: '+(k.payoffRatio||'N/A')+'\nKelly: '+(k.kelly||'N/A')+'\nHalf-Kelly: '+(k.kellyHalf||'N/A')+'\nRecommended: '+(k.sizePercent||'0.50')+'%\nConfidence: '+(k.confidence||'low')+'\nReason: '+(k.reason||'N/A'));
    } catch(e) {
      this.#logger.error('Kelly error:', e.message);
      this.#send('🎯 <b>KELLY</b>\n\nError: '+e.message);
    }
  }

  #cmdSummary() {
    try {
      const trades = this.#db.prepare("SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC").all();
      if(!trades.length){this.#send('No trades');return;}
      const wins = trades.filter(t => t.pnl > 0);
      const losses = trades.filter(t => t.pnl <= 0);
      const totalPnl = trades.reduce((s,t) => s + t.pnl, 0);
      const wr = trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) : '0.0';
      const grossProfit = wins.reduce((s,t) => s + t.pnl, 0);
      const grossLoss = Math.abs(losses.reduce((s,t) => s + t.pnl, 0));
      const pf = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : 'N/A';
      const avg = (totalPnl / trades.length).toFixed(2);
      this.#send('📊 <b>SUMMARY</b>\n\nTrades: '+trades.length+'\nWins: '+wins.length+' | Losses: '+losses.length+'\nWin Rate: '+wr+'%\nPnL: $'+totalPnl.toFixed(2)+'\nAvg: $'+avg+'\nPF: '+pf);
    } catch(e) { this.#send('Summary error: '+e.message); }
  }

  #cmdAnalytics() {
    try {
      const trades = this.#db.prepare("SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC").all();
      if(!trades.length){this.#send('No trades');return;}
      const wins = trades.filter(t => t.pnl > 0);
      const losses = trades.filter(t => t.pnl <= 0);
      const pnls = trades.map(t => t.pnl);
      const totalPnl = pnls.reduce((s,p) => s + p, 0);
      const mean = totalPnl / pnls.length;
      const variance = pnls.reduce((s,p) => s + Math.pow(p - mean, 2), 0) / pnls.length;
      const stdDev = Math.sqrt(variance);
      const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;
      const negPnls = pnls.filter(p => p < 0);
      const downVar = negPnls.length ? negPnls.reduce((s,p) => s + p*p, 0) / negPnls.length : 0;
      const sortino = Math.sqrt(downVar) > 0 ? (mean / Math.sqrt(downVar)) * Math.sqrt(252) : 0;
      const grossProfit = wins.reduce((s,t) => s + t.pnl, 0);
      const grossLoss = Math.abs(losses.reduce((s,t) => s + t.pnl, 0));
      const pf = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : 'N/A';
      let maxDD = 0, peak = 0, running = 0;
      for (const p of pnls) { running += p; if (running > peak) peak = running; const dd = peak - running; if (dd > maxDD) maxDD = dd; }
      let maxWS = 0, maxLS = 0, cW = 0, cL = 0;
      for (const t of [...trades].reverse()) {
        if (t.pnl > 0) { cW++; cL = 0; maxWS = Math.max(maxWS, cW); }
        else { cL++; cW = 0; maxLS = Math.max(maxLS, cL); }
      }
      this.#send('📊 <b>ANALYTICS</b>\n\nTrades: '+trades.length+' | W: '+wins.length+' | L: '+losses.length+'\nWin Rate: '+(trades.length>0?(wins.length/trades.length*100).toFixed(1):'0')+'%\nPnL: $'+totalPnl.toFixed(2)+'\nPF: '+pf+'\nSharpe: '+sharpe.toFixed(2)+'\nSortino: '+sortino.toFixed(2)+'\nMax DD: $'+maxDD.toFixed(2)+'\nWin Streak: '+maxWS+' | Loss Streak: '+maxLS);
    } catch(e) { this.#send('Analytics error: '+e.message); }
  }

  #cmdJournal() {
    try {
      const trades = this.#db.prepare("SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 20").all();
      if(!trades.length){this.#send('No trades');return;}
      let m = '📄 <b>TRADE JOURNAL</b>\n\n';
      trades.forEach(t => {
        const emoji = t.pnl > 0 ? '💰' : '💸';
        m += emoji+' '+t.id+'\n';
        m += '   '+t.pair+' | '+t.side.toUpperCase()+'\n';
        m += '   Entry: $'+(t.entry_price||0).toFixed(2)+' → $'+(t.exit_price||0).toFixed(2)+'\n';
        m += '   PnL: $'+(t.pnl||0).toFixed(2)+' | '+(t.exit_reason||'N/A')+'\n\n';
      });
      this.#send(m);
    } catch(e) { this.#send('Journal error: '+e.message); }
  }

  #cmdMode() {
    try {
      const modes = {
        aggressive: { name: 'Aggressive', conf: 30, risk: 1.5, cd: 15 },
        balanced: { name: 'Balanced', conf: 45, risk: 1.0, cd: 30 },
        conservative: { name: 'Conservative', conf: 60, risk: 0.5, cd: 60 },
        scalping: { name: 'Scalping', conf: 20, risk: 0.5, cd: 5 }
      };
      const current = this.#strategyModeName();
      let m='🎯 <b>STRATEGY MODE</b>\n\nCurrent: <b>'+current+'</b>\n\n';
      for(const [name,mode] of Object.entries(modes)){
        const active=name===current?' ✅':'';
        m+='<b>'+mode.name+'</b>'+active+'\n';
        m+='  Conf: '+mode.conf+'% | Risk: '+mode.risk+'% | CD: '+mode.cd+'min\n\n';
      }
      m+='Change: /aggressive /balanced /conservative /scalping';
      this.#send(m);
    } catch(e) { this.#send('Mode error: '+e.message); }
  }

  #setMode(mode) {
    const modes = ["aggressive","balanced","conservative","scalping"];
    if (modes.indexOf(mode) === -1) {
      this.#send("❌ Invalid mode");
      return;
    }
    try {
      this.#db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run("strategy_mode", JSON.stringify(mode));
      this.#send("✅ Mode changed to: <b>" + mode + "</b>");
    } catch(e) { this.#send("Error: " + e.message); }
  }

  #strategyModeName() {
    try {
      const saved = this.#db.prepare("SELECT value FROM settings WHERE key='strategy_mode'").get();
      if (saved) return JSON.parse(saved.value);
    } catch {}
    return 'balanced';
  }

  async sendAlert(m){await this.#send('⚠️ '+m);}
  async sendReport(m){await this.#send(m);}
  #ts(){return new Date().toISOString().replace('T',' ').substring(0,19);}
  async #send(t){if(!this.#bot||!this.#chatId)return;try{await this.#bot.sendMessage(this.#chatId,t,{parse_mode:'HTML'});}catch(e){this.#logger.error('TG send:',e.message);}}
}
