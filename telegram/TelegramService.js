import TelegramBot from 'node-telegram-bot-api';
import { MessageFormatter } from './MessageFormatter.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { PositionSizer } from '../risk/PositionSizer.js';
import { totalmem, freemem, cpus } from 'os';

export class TelegramService {
  #config; #logger; #eventBus; #tradeManager; #bot=null; #fmt; #chatId;
  #portRepo; #posRepo; #db; #sizer; #strategyMode;
  #lastRestart=0; #restartCount=0; #startTime; #exchangeLatency=0;

  constructor(c,l,eb,tm,db,sm) {
    this.#config=c; this.#logger=l; this.#eventBus=eb; this.#tradeManager=tm;
    this.#fmt=new MessageFormatter(); this.#chatId=c.telegram.chatId;
    this.#portRepo=new PortfolioRepository(db); this.#posRepo=new PositionRepository(db);
    this.#db=db; this.#sizer=new PositionSizer(c); this.#startTime=Date.now();
    this.#strategyMode=sm;
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

    // FIX: Session block/resume notifications
    this.#eventBus.on('session:blocked',d=>this.#send('⏸️ <b>SESSION BLOCKED</b>\n\n'+d.reason+'\nSession: '+d.session));
    this.#eventBus.on('session:resumed',d=>this.#send('▶️ <b>SESSION RESUMED</b>\n\nSession: '+d.session));
  }

  #formatAI(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    const emoji = d.decision === 'approve' ? '✅' : d.decision === 'reject' ? '❌' : '⏳';
    const confColor = d.confidence >= 70 ? '🟢' : d.confidence >= 50 ? '🟡' : '🔴';
    return '🤖 <b>AI VALIDATION</b>\n\nPair: <code>'+d.pair+'</code>\nSide: <code>'+(d.side?.toUpperCase()||'N/A')+'</code>\nDecision: <code>'+emoji+' '+(d.decision?.toUpperCase()||'N/A')+'</code>\nConfidence: <code>'+confColor+' '+d.confidence+'%</code>\nReason: <code>'+(d.reason||'N/A')+'</code>\nLatency: <code>'+(d.latency||0)+'ms</code>\n\n🕐 '+t;
  }

  #setupCommands() {
    const auth = (msg, handler) => {
      if (String(msg.chat.id) !== String(this.#chatId)) return;
      handler();
    };
    this.#bot.onText(/\/start/, (msg) => auth(msg, () => this.#send(this.#helpText())));
    this.#bot.onText(/\/help/, (msg) => auth(msg, () => this.#send(this.#helpText())));
    this.#bot.onText(/\/status/, (msg) => auth(msg, async () => this.#cmdStatus()));
    this.#bot.onText(/\/positions/, (msg) => auth(msg, () => this.#cmdPositions()));
    this.#bot.onText(/\/balance/, (msg) => auth(msg, () => this.#cmdBalance()));
    this.#bot.onText(/\/trades/, (msg) => auth(msg, async () => this.#cmdTrades()));
    this.#bot.onText(/\/stats/, (msg) => auth(msg, () => this.#cmdStats()));
    this.#bot.onText(/\/config/, (msg) => auth(msg, () => this.#cmdConfig()));
    this.#bot.onText(/\/risk/, (msg) => auth(msg, () => this.#cmdRisk()));
    this.#bot.onText(/\/health/, (msg) => auth(msg, () => this.#cmdHealth()));
    this.#bot.onText(/\/equity/, (msg) => auth(msg, () => this.#cmdEquity()));
    this.#bot.onText(/\/pause/, (msg) => auth(msg, () => { this.#tradeManager.pause('Manual'); this.#send('⏸️ Paused'); }));
    this.#bot.onText(/\/resume/, (msg) => auth(msg, () => { this.#tradeManager.resume(); this.#send('▶️ Resumed'); }));
    this.#bot.onText(/\/closeall/, (msg) => auth(msg, () => { this.#tradeManager.closeAll('telegram'); this.#send('🔴 Closing all...'); }));
    this.#bot.onText(/\/closelast/, (msg) => auth(msg, () => { this.#tradeManager.closeLast('telegram'); this.#send('🔴 Closing last...'); }));
    this.#bot.onText(/\/orderbook/, (msg) => auth(msg, async () => this.#cmdOrderbook()));
    this.#bot.onText(/\/kelly/, (msg) => auth(msg, () => this.#cmdKelly()));
    this.#bot.onText(/\/summary/, (msg) => auth(msg, () => this.#cmdSummary()));
    this.#bot.onText(/\/analytics/, (msg) => auth(msg, () => this.#cmdAnalytics()));
    this.#bot.onText(/\/journal/, (msg) => auth(msg, () => this.#cmdJournal()));
    this.#bot.onText(/\/mode/, (msg) => auth(msg, () => this.#cmdMode()));
    this.#bot.onText(/\/aggressive/, (msg) => auth(msg, () => this.#setMode('aggressive')));
    this.#bot.onText(/\/balanced/, (msg) => auth(msg, () => this.#setMode('balanced')));
    this.#bot.onText(/\/conservative/, (msg) => auth(msg, () => this.#setMode('conservative')));
    this.#bot.onText(/\/scalping/, (msg) => auth(msg, () => this.#setMode('scalping')));
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

  async #cmdTrades() {
    const t=this.#posRepo.findAll(10);
    if(!t||!t.length){this.#send('No trades');return;}
    let m='📋 <b>TRADE HISTORY</b>\n\n';
    let wins=0, losses=0, totalPnl=0;
    let prices={};
    try { prices=await this.#fetchPrices(); } catch{}
    for(const x of t){
      const isopen=x.status==='open';
      let displayPnl=x.pnl||0;
      let displayRoi=x.roi||0;
      if(isopen && prices[x.pair]){
        const cp=prices[x.pair];
        const qty=x.remaining_quantity||x.quantity;
        displayPnl=x.side==='long'?(cp-x.entry_price)*qty:(x.entry_price-cp)*qty;
        displayRoi=x.entry_price>0?(displayPnl/(x.entry_price*qty))*100:0;
      }
      const emoji=isopen?'🟢':(displayPnl>0?'💰':'💸');
      const sign=displayPnl>=0?'+':'';
      const hold=x.hold_duration?Math.floor(x.hold_duration/3600000)+'h '+Math.floor((x.hold_duration%3600000)/60000)+'m':'N/A';
      const reason=x.exit_reason||'open';
      m+=emoji+' <b>'+x.id+'</b>\n';
      m+='   '+x.pair+' | '+x.side.toUpperCase()+'\n';
      m+='   Entry: $'+(x.entry_price||0).toFixed(2);
      if(x.exit_price) m+=' → $'+x.exit_price.toFixed(2);
      m+='\n';
      m+='   PnL: '+sign+'$'+displayPnl.toFixed(2);
      if(displayRoi) m+=' ('+sign+displayRoi.toFixed(2)+'%)';
      m+='\n';
      m+='   '+reason+' | '+hold+'\n\n';
      if(!isopen){totalPnl+=(x.pnl||0);if(x.pnl>0)wins++;else losses++;}
    }
    m+='─────────────────────\n';
    m+='📊 <b>SUMMARY</b>\n';
    m+='Total: '+t.length+' | W: '+wins+' | L: '+losses+'\n';
    m+='PnL: '+(totalPnl>=0?'+':'')+'$'+totalPnl.toFixed(2);
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

    let exStatus='✅', exLatency=0;
    try { const s=Date.now(); await this.#tradeManager.orderbook.analyze(this.#config.exchange.pair); exLatency=Date.now()-s; }
    catch { exStatus='❌'; exLatency=-1; }

    const currentMode=this.#strategyModeName();

    this.#send('🏥 <b>HEALTH</b>\n\nCPU: <code>'+cpu+'%</code>\nRAM: <code>'+ram+'%</code>\nUptime: <code>'+h+'h '+m+'m</code>\nPositions: <code>'+this.#posRepo.countOpen()+'</code>\nMode: <code>'+currentMode+'</code>\nStatus: <code>'+(this.#tradeManager.isPaused?'⏸️ PAUSED':'▶️ RUNNING')+'</code>\nExchange: <code>'+exStatus+' ('+exLatency+'ms)</code>\nTelegram: <code>✅ Connected</code>\nAI: <code>'+(this.#config.ai.enabled?'✅ ON':'❌ OFF')+'</code>\nDB: <code>✅ OK</code>');
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
      if(!trades.length){this.#send('🎯 <b>KELLY</b>\n\nNo trades yet.');return;}
      if(trades.length<10){this.#send('🎯 <b>KELLY</b>\n\nTrades: '+trades.length+'\nNeed min 10 trades.');return;}
      const k=this.#sizer.calculateKelly(trades,bal);
      this.#send('🎯 <b>KELLY</b>\n\nTrades: '+trades.length+'\nWin Rate: '+(k.winRate||'N/A')+'\nPayoff: '+(k.payoffRatio||'N/A')+'\nKelly: '+(k.kelly||'N/A')+'\nRecommended: '+(k.sizePercent||'0.50')+'%');
    } catch(e){this.#send('Kelly error: '+e.message);}
  }

  #cmdSummary() {
    try {
      const trades=this.#db.prepare("SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC").all();
      if(!trades.length){this.#send('No trades');return;}
      const wins=trades.filter(t=>t.pnl>0), losses=trades.filter(t=>t.pnl<=0);
      const totalPnl=trades.reduce((s,t)=>s+t.pnl,0);
      const wr=trades.length>0?((wins.length/trades.length)*100).toFixed(1):'0.0';
      const gp=wins.reduce((s,t)=>s+t.pnl,0), gl=Math.abs(losses.reduce((s,t)=>s+t.pnl,0));
      const pf=gl>0?(gp/gl).toFixed(2):'N/A';
      this.#send('📊 <b>SUMMARY</b>\n\nTrades: '+trades.length+'\nWins: '+wins.length+' | Losses: '+losses.length+'\nWin Rate: '+wr+'%\nPnL: $'+totalPnl.toFixed(2)+'\nAvg: $'+(totalPnl/trades.length).toFixed(2)+'\nPF: '+pf);
    } catch(e){this.#send('Error');}
  }

  #cmdAnalytics() {
    try {
      const trades=this.#db.prepare("SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC").all();
      if(!trades.length){this.#send('No trades');return;}
      const wins=trades.filter(t=>t.pnl>0), losses=trades.filter(t=>t.pnl<=0);
      const pnls=trades.map(t=>t.pnl), totalPnl=pnls.reduce((s,p)=>s+p,0);
      const mean=totalPnl/pnls.length;
      const variance=pnls.reduce((s,p)=>s+Math.pow(p-mean,2),0)/pnls.length;
      const sharpe=Math.sqrt(variance)>0?(mean/Math.sqrt(variance))*Math.sqrt(252):0;
      const neg=pnls.filter(p=>p<0);
      const dv=neg.length?neg.reduce((s,p)=>s+p*p,0)/neg.length:0;
      const sortino=Math.sqrt(dv)>0?(mean/Math.sqrt(dv))*Math.sqrt(252):0;
      const gp=wins.reduce((s,t)=>s+t.pnl,0), gl=Math.abs(losses.reduce((s,t)=>s+t.pnl,0));
      const pf=gl>0?(gp/gl).toFixed(2):'N/A';
      let maxDD=0,peak=0,run=0;
      pnls.forEach(p=>{run+=p;if(run>peak)peak=run;const dd=peak-run;if(dd>maxDD)maxDD=dd;});
      let mws=0,mls=0,cw=0,cl=0;
      [...trades].reverse().forEach(t=>{if(t.pnl>0){cw++;cl=0;mws=Math.max(mws,cw);}else{cl++;cw=0;mls=Math.max(mls,cl);}});
      this.#send('📊 <b>ANALYTICS</b>\n\nTrades: '+trades.length+' | W: '+wins.length+' | L: '+losses.length+'\nWin Rate: '+(trades.length>0?(wins.length/trades.length*100).toFixed(1):'0')+'%\nPnL: $'+totalPnl.toFixed(2)+'\nPF: '+pf+'\nSharpe: '+sharpe.toFixed(2)+'\nSortino: '+sortino.toFixed(2)+'\nMax DD: $'+maxDD.toFixed(2)+'\nWin Streak: '+mws+' | Loss Streak: '+mls);
    } catch(e){this.#send('Error');}
  }

  #cmdJournal() {
    try {
      const trades=this.#db.prepare("SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 20").all();
      if(!trades.length){this.#send('No trades');return;}
      let m='📄 <b>TRADE JOURNAL</b>\n\n';
      trades.forEach(t=>{const e=t.pnl>0?'💰':'💸';m+=e+' '+t.id+'\n   '+t.pair+' | '+t.side.toUpperCase()+'\n   $'+(t.entry_price||0).toFixed(2)+' → $'+(t.exit_price||0).toFixed(2)+'\n   PnL: $'+(t.pnl||0).toFixed(2)+' | '+(t.exit_reason||'N/A')+'\n\n';});
      this.#send(m);
    } catch(e){this.#send('Error');}
  }

  #cmdMode() {
    try {
      const modes={aggressive:{name:'Aggressive',conf:40,risk:1.0,cd:15},balanced:{name:'Balanced',conf:55,risk:0.75,cd:30},conservative:{name:'Conservative',conf:70,risk:0.5,cd:60},scalping:{name:'Scalping',conf:35,risk:0.5,cd:5}};
      const current=this.#strategyModeName();
      let m='🎯 <b>STRATEGY MODE</b>\n\nCurrent: <b>'+current+'</b>\n\n';
      for(const[n,mode] of Object.entries(modes)){const a=n===current?' ✅':'';m+='<b>'+mode.name+'</b>'+a+'\n  Conf: '+mode.conf+'% | Risk: '+mode.risk+'% | CD: '+mode.cd+'min\n\n';}
      m+='Change: /aggressive /balanced /conservative /scalping';
      this.#send(m);
    } catch(e){this.#send('Mode error');}
  }

  #setMode(mode) {
    if(['aggressive','balanced','conservative','scalping'].indexOf(mode)===-1){this.#send('❌ Invalid mode');return;}
    try {
      if (this.#strategyMode) this.#strategyMode.setMode(mode);
      else {
        this.#db.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run('strategy_mode',JSON.stringify(mode));
      }
      this.#send('✅ Mode changed to: <b>'+mode+'</b>');
    } catch(e){this.#send('Error: '+e.message);}
  }

  #strategyModeName() {
    try { const s=this.#db.prepare("SELECT value FROM settings WHERE key='strategy_mode'").get(); if(s) return JSON.parse(s.value); } catch{}
    return 'balanced';
  }

  async sendAlert(m){await this.#send('⚠️ '+m);}
  async sendReport(m){await this.#send(m);}
  #ts(){return new Date().toISOString().replace('T',' ').substring(0,19);}
  async #send(t){if(!this.#bot||!this.#chatId)return;try{await this.#bot.sendMessage(this.#chatId,t,{parse_mode:'HTML'});}catch(e){this.#logger.error('TG send:',e.message);}}
}
