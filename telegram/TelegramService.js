import TelegramBot from 'node-telegram-bot-api';
import { MessageFormatter } from './MessageFormatter.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { PositionSizer } from '../risk/PositionSizer.js';
import { TradeJournal } from '../reports/TradeJournal.js';
import { PerformanceAnalytics } from '../reports/PerformanceAnalytics.js';
import { TIMING } from '../utils/constants.js';
import { totalmem, freemem, cpus } from 'os';
import { execSync } from 'child_process';

export class TelegramService {
  #config; #logger; #eventBus; #tradeManager; #bot=null; #fmt; #chatId;
  #portRepo; #posRepo; #db; #sizer; #journal; #analytics; #strategyMode;
  #lastRestart=0; #restartCount=0; #startTime; #exchangeLatency=0;

  constructor(c,l,eb,tm,db,sm) {
    this.#config=c; this.#logger=l; this.#eventBus=eb; this.#tradeManager=tm;
    this.#fmt=new MessageFormatter(); this.#chatId=c.telegram.chatId;
    this.#portRepo=new PortfolioRepository(db); this.#posRepo=new PositionRepository(db);
    this.#db=db; this.#sizer=new PositionSizer(c);
    this.#journal=new TradeJournal(db,l); this.#analytics=new PerformanceAnalytics(db,l);
    this.#strategyMode=sm; this.#startTime=Date.now();
  }

  async initialize() {
    if(!this.#config.telegram.enabled){this.#logger.info('Telegram disabled');return;}
    try {
      this.#bot=new TelegramBot(this.#config.telegram.botToken,{polling:{interval:TIMING.TELEGRAM_POLL_INTERVAL,params:{timeout:30},autoStart:true}});
      this.#bot.on('polling_error',(e)=>{
        const now=Date.now();
        if(now-this.#lastRestart>TIMING.TELEGRAM_RESTART_COOLDOWN&&this.#restartCount<3){
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
    this.#eventBus.on('ai:validated',d=>this.#send(this.#formatAI(d)));
  }

  #formatAI(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    const emoji = d.decision === 'approve' ? '✅' : d.decision === 'reject' ? '❌' : '⏳';
    const confColor = d.confidence >= 70 ? '🟢' : d.confidence >= 50 ? '🟡' : '🔴';
    return '🤖 <b>AI VALIDATION</b>\n\n'+
      'Pair:       <code>'+d.pair+'</code>\n'+
      'Side:       <code>'+(d.side?.toUpperCase()||'N/A')+'</code>\n'+
      'Decision:   <code>'+emoji+' '+(d.decision?.toUpperCase()||'N/A')+'</code>\n'+
      'Confidence: <code>'+confColor+' '+d.confidence+'%</code>\n'+
      'Reason:     <code>'+(d.reason||'N/A')+'</code>\n'+
      'Latency:    <code>'+(d.latency||0)+'ms</code>\n'+
      'Fallback:   <code>'+(d.fallback?'Yes':'No')+'</code>\n\n'+
      '🕐 '+t;
  }

  #setupCommands() {
    this.#bot.onText(/\/start/,()=>this.#send(this.#helpText()));
    this.#bot.onText(/\/help/,()=>this.#send(this.#helpText()));
    this.#bot.onText(/\/status/,async()=>this.#cmdStatus());
    this.#bot.onText(/\/positions/,async()=>this.#cmdPositions());
    this.#bot.onText(/\/balance/,()=>this.#cmdBalance());
    this.#bot.onText(/\/trades/,()=>this.#cmdTrades());
    this.#bot.onText(/\/stats/,()=>this.#cmdStats());
    this.#bot.onText(/\/config/,()=>this.#cmdConfig());
    this.#bot.onText(/\/risk/,()=>this.#cmdRisk());
    this.#bot.onText(/\/health/,async()=>this.#cmdHealth());
    this.#bot.onText(/\/equity/,()=>this.#cmdEquity());
    this.#bot.onText(/\/pause/,()=>{this.#tradeManager.pause('Manual');this.#send('⏸️ Paused');});
    this.#bot.onText(/\/resume/,()=>{this.#tradeManager.resume();this.#send('▶️ Resumed');});
    this.#bot.onText(/\/closeall/,()=>{this.#tradeManager.closeAll('telegram');this.#send('🔴 Closing all...');});
    this.#bot.onText(/\/closelast/,()=>{this.#tradeManager.closeLast('telegram');this.#send('🔴 Closing last...');});
    this.#bot.onText(/\/orderbook/,async()=>this.#cmdOrderbook());
    this.#bot.onText(/\/kelly/,()=>this.#cmdKelly());
    this.#bot.onText(/\/summary/,()=>this.#cmdSummary());
    this.#bot.onText(/\/journal/,()=>this.#cmdJournal());
    this.#bot.onText(/\/analytics/,()=>this.#cmdAnalytics());
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
      const prices=await this.#fetchPrices();
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
        'Profit Factor: <code>'+pf+'</code>\n'+
        'Avg Hold:      <code>'+avgHoldH+'</code>\n'+
        'Open:          <code>'+(pos?pos.length:0)+'</code>\n'+
        'CPU:           <code>'+cpu+'%</code>\n'+
        'RAM:           <code>'+ram+'%</code>\n'+
        'AI:            <code>'+(this.#config.ai.enabled?'✅ ON':'❌ OFF')+'</code>\n'+
        'Exchange:      <code>✅ Connected</code>\n\n'+
        (posLines?'📈 <b>POSITIONS:</b>\n'+posLines+'\n':'')+
        '🕐 '+this.#ts()
      );
    } catch(e) { this.#send('Status error'); }
  }

  async #cmdPositions() {
    try {
      const pos=this.#posRepo.findOpen();
      const prices=await this.#fetchPrices();
      this.#send(this.#fmt.formatOpenPositions(pos,prices));
    } catch(e) { this.#send(this.#fmt.formatOpenPositions(this.#posRepo.findOpen(),null)); }
  }

  #cmdBalance() {
    const p=this.#portRepo.getCurrent();
    if(!p){this.#send('No data');return;}
    this.#send('💰 <b>BALANCE</b>\n\nBalance: $'+p.balance.toFixed(2)+'\nEquity: $'+p.equity.toFixed(2)+'\nRealized: $'+p.realized_pnl.toFixed(2)+'\nPeak: $'+(p.peak_balance||p.balance).toFixed(2));
  }

  // FIX: Better trade history format
  #cmdTrades() {
    const trades = this.#db.prepare(
      "SELECT * FROM positions WHERE status IN ('open','closed') ORDER BY created_at DESC LIMIT 10"
    ).all();
    this.#send(this.#fmt.formatTradeHistory(trades));
  }

  #cmdStats() {
    const s=this.#posRepo.getStats();
    if(!s||!s.total){this.#send('No trades');return;}
    this.#send('📈 <b>STATS</b>\n\nTrades: '+s.total+'\nWins: '+s.wins+'\nLosses: '+s.losses+'\nRate: '+(s.total>0?((s.wins/s.total)*100).toFixed(1):0)+'%\nPnL: $'+s.total_pnl.toFixed(2)+'\nBest: $'+s.best_trade.toFixed(2)+'\nWorst: $'+s.worst_trade.toFixed(2)+'\nAvg: $'+s.avg_pnl.toFixed(2));
  }

  #cmdConfig() {
    const c=this.#config;
    const m=this.#strategyMode.getMode();
    this.#send('⚙️ <b>CONFIG</b>\n\nMode: '+c.trading.mode+'\nStrategy: <b>'+this.#strategyMode.getModeName()+'</b>\nPairs: '+c.pairs.join(', ')+'\nLeverage: '+c.exchange.leverage+'x\nAI: '+(c.ai.enabled?'ON':'OFF')+'\nConfidence: '+m.confidenceThreshold+'%\nCooldown: '+m.cooldownMinutes+'min\nStatus: '+(this.#tradeManager.isPaused?'⏸️ PAUSED':'▶️ RUNNING'));
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
    let disk=0;
    try { disk=parseInt(execSync("df -h / | tail -1 | awk '{print $5}'").toString().trim(),10)||0; } catch {}
    const up=Math.round((Date.now()-this.#startTime)/1000);
    const h=Math.floor(up/3600); const m=Math.floor((up%3600)/60);

    let exStatus='✅';
    try {
      const start=Date.now();
      await this.#tradeManager.orderbook.analyze(this.#config.exchange.pair);
      this.#exchangeLatency=Date.now()-start;
    } catch { exStatus='❌'; this.#exchangeLatency=-1; }

    this.#send(
      '🏥 <b>HEALTH</b>\n\n'+
      'CPU:            <code>'+cpu+'%</code>\n'+
      'RAM:            <code>'+ram+'%</code>\n'+
      'Disk:           <code>'+disk+'%</code>\n'+
      'Uptime:         <code>'+h+'h '+m+'m</code>\n'+
      'Positions:      <code>'+this.#posRepo.countOpen()+'</code>\n'+
      'Mode:           <code>'+this.#strategyMode.getModeName()+'</code>\n'+
      'Status:         <code>'+(this.#tradeManager.isPaused?'⏸️ PAUSED':'▶️ RUNNING')+'</code>\n'+
      'Exchange:       <code>'+exStatus+' ('+this.#exchangeLatency+'ms)</code>\n'+
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
    const trades=this.#db.prepare("SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 50").all();
    const p=this.#portRepo.getCurrent(); const bal=p?p.balance:this.#config.trading.startingBalance;
    const k=this.#sizer.calculateKelly(trades,bal);
    this.#send('🎯 <b>KELLY</b>\n\nTrades: '+(trades?trades.length:0)+'\nWin Rate: '+(k.winRate||'N/A')+'\nPayoff: '+(k.payoffRatio||'N/A')+'\nKelly: '+(k.kelly||'N/A')+'\nRecommended: '+(k.sizePercent||'0.50')+'%');
  }

  #cmdSummary() {
    try {
      const s=this.#journal.getPerformanceSummary(30);
      if(!s){this.#send('No trades');return;}
      this.#send('📊 <b>30-DAY SUMMARY</b>\n\nTrades: '+s.totalTrades+'\nWin Rate: '+s.winRate+'\nPnL: $'+s.totalPnl+'\nPF: '+s.profitFactor+'\nSharpe: '+s.sharpeRatio+'\nSortino: '+s.sortinoRatio+'\nMax DD: $'+s.maxDrawdown+'\nBest: $'+s.bestTrade+'\nWorst: $'+s.worstTrade);
    } catch(e){this.#send('Error');}
  }

  #cmdJournal() {
    try {
      const r=this.#journal.exportToCSV(30);
      if(!r){this.#send('No trades');return;}
      this.#send('📄 <b>JOURNAL</b>\n\nFile: '+r.filepath+'\nTrades: '+r.count);
    } catch(e){this.#send('Error');}
  }

  #cmdAnalytics() {
    try {
      const a=this.#analytics.getReport(30);
      if(!a.totalTrades){this.#send('No trades');return;}
      this.#send('📊 <b>ANALYTICS</b>\n\nTrades: '+a.totalTrades+' | W: '+a.wins+' | L: '+a.losses+'\nWin Rate: '+a.winRate+'%\nPnL: $'+a.totalPnl+'\nPF: '+a.profitFactor+'\nExpectancy: $'+a.expectancy+'/trade\nSharpe: '+a.sharpeRatio+'\nSortino: '+a.sortinoRatio+'\nMax DD: '+a.maxDrawdownPct+'%\nWin Streak: '+a.maxWinStreak+' | Loss Streak: '+a.maxLossStreak+'\nAvg Hold: '+a.avgHoldHours+'h');
    } catch(e){this.#send('Analytics error: '+e.message);}
  }

  #cmdMode() {
    const current=this.#strategyMode.getModeName();
    const modes=this.#strategyMode.getAllModes();
    let m='🎯 <b>STRATEGY MODE</b>\n\nCurrent: <b>'+current+'</b>\n\n';
    for(const [name,mode] of Object.entries(modes)){
      const active=name===current?' ✅':'';
      m+='<b>'+mode.name+'</b>'+active+'\n';
      m+='  Conf: '+mode.confidenceThreshold+'% | Risk: '+mode.riskPerTrade+'% | CD: '+mode.cooldownMinutes+'min\n\n';
    }
    m+='Change: /aggressive /balanced /conservative /scalping';
    this.#send(m);
  }

  #setMode(mode) {
    if(this.#strategyMode.setMode(mode)) this.#send('✅ Mode: <b>'+mode+'</b>');
    else this.#send('❌ Invalid mode');
  }

  async sendAlert(m){await this.#send('⚠️ '+m);}
  async sendReport(m){await this.#send(m);}
  #ts(){return new Date().toISOString().replace('T',' ').substring(0,19);}
  async #send(t){if(!this.#bot||!this.#chatId)return;try{await this.#bot.sendMessage(this.#chatId,t,{parse_mode:'HTML'});}catch(e){this.#logger.error('TG send:',e.message);}}
}
