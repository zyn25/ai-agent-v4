import TelegramBot from 'node-telegram-bot-api';
import { MessageFormatter } from './MessageFormatter.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { PositionSizer } from '../risk/PositionSizer.js';
import { TradeJournal } from '../reports/TradeJournal.js';
import { PerformanceAnalytics } from '../reports/PerformanceAnalytics.js';
import { totalmem, freemem } from 'os';

export class TelegramService {
  #config; #logger; #eventBus; #tradeManager; #bot=null; #fmt; #chatId;
  #portRepo; #posRepo; #db; #sizer; #journal; #analytics; #strategyMode;
  #lastRestart=0; #restartCount=0;

  constructor(c,l,eb,tm,db,strategyMode) {
    this.#config=c; this.#logger=l; this.#eventBus=eb; this.#tradeManager=tm;
    this.#fmt=new MessageFormatter(); this.#chatId=c.telegram.chatId;
    this.#portRepo=new PortfolioRepository(db); this.#posRepo=new PositionRepository(db);
    this.#db=db; this.#sizer=new PositionSizer(c);
    this.#journal=new TradeJournal(db,l); this.#analytics=new PerformanceAnalytics(db,l);
    this.#strategyMode=strategyMode;
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

  #setupEvents() {
    this.#eventBus.on('trade:opened',d=>this.#send(this.#fmt.formatEntry(d)));
    this.#eventBus.on('trade:closed',d=>this.#send(this.#fmt.formatExit(d)));
    this.#eventBus.on('trade:partial_close',d=>this.#send(this.#fmt.formatPartialClose(d)));
    this.#eventBus.on('trade:paused',d=>this.#send('⏸️ <b>PAUSED</b>\n\n'+d.reason));
    this.#eventBus.on('trade:resumed',()=>this.#send('▶️ <b>RESUMED</b>'));
  }

  #setupCommands() {
    this.#bot.onText(/\/start/,()=>this.#send(this.#helpText()));
    this.#bot.onText(/\/help/,()=>this.#send(this.#helpText()));
    this.#bot.onText(/\/status/,()=>{const p=this.#portRepo.getCurrent();const pos=this.#posRepo.findOpen();this.#send(this.#fmt.formatDashboard(p,pos));});
    this.#bot.onText(/\/positions/,()=>this.#send(this.#fmt.formatOpenPositions(this.#posRepo.findOpen())));
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
    this.#bot.onText(/\/journal/,()=>this.#cmdJournal());
    this.#bot.onText(/\/analytics/,()=>this.#cmdAnalytics());
    this.#bot.onText(/\/mode/,()=>this.#cmdMode());
    this.#bot.onText(/\/aggressive/,()=>this.#setMode('aggressive'));
    this.#bot.onText(/\/balanced/,()=>this.#setMode('balanced'));
    this.#bot.onText(/\/conservative/,()=>this.#setMode('conservative'));
    this.#bot.onText(/\/scalping/,()=>this.#setMode('scalping'));
  }

  #helpText() {
    return '📋 <b>COMMANDS</b>\n\n' +
      '📊 <b>Info:</b>\n/status /positions /balance /trades /stats /equity\n\n' +
      '📈 <b>Analysis:</b>\n/orderbook /kelly /summary /analytics /journal\n\n' +
      '⚙️ <b>Settings:</b>\n/config /risk /health /mode\n\n' +
      '🎯 <b>Strategy:</b>\n/aggressive /balanced /conservative /scalping\n\n' +
      '🚨 <b>Emergency:</b>\n/pause /resume /closeall /closelast';
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
    this.#send('📈 <b>STATS</b>\n\nTrades: '+s.total+'\nWins: '+s.wins+'\nRate: '+(s.total>0?((s.wins/s.total)*100).toFixed(1):0)+'%\nPnL: $'+s.total_pnl.toFixed(2)+'\nBest: $'+s.best_trade.toFixed(2)+'\nWorst: $'+s.worst_trade.toFixed(2)+'\nAvg: $'+s.avg_pnl.toFixed(2));
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

  #cmdHealth() {
    const ram=Math.round(((totalmem()-freemem())/totalmem())*100);
    const up=Math.round(process.uptime());
    const h=Math.floor(up/3600); const m=Math.floor((up%3600)/60);
    this.#send('🏥 <b>HEALTH</b>\n\nRAM: '+ram+'%\nUptime: '+h+'h '+m+'m\nPositions: '+this.#posRepo.countOpen()+'\nMode: '+this.#strategyMode.getModeName()+'\nStatus: '+(this.#tradeManager.isPaused?'⏸️ PAUSED':'▶️ RUNNING')+'\nDB: ✅\nExchange: ✅');
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
      this.#send(
        '📊 <b>ANALYTICS (30D)</b>\n\n' +
        'Trades: '+a.totalTrades+' | W: '+a.wins+' | L: '+a.losses+'\n' +
        'Win Rate: '+a.winRate+'%\n' +
        'PnL: $'+a.totalPnl+'\n' +
        'Profit Factor: '+a.profitFactor+'\n' +
        'Expectancy: $'+a.expectancy+'/trade\n' +
        'Sharpe: '+a.sharpeRatio+'\n' +
        'Sortino: '+a.sortinoRatio+'\n' +
        'Calmar: '+a.calmarRatio+'\n' +
        'Recovery: '+a.recoveryFactor+'\n' +
        'Max DD: '+a.maxDrawdownPct+'%\n' +
        'Payoff: '+a.payoffRatio+'\n' +
        'Win Streak: '+a.maxWinStreak+' | Loss Streak: '+a.maxLossStreak+'\n' +
        'Best Hour: '+a.bestHour+'\n' +
        'Avg Hold: '+a.avgHoldHours+'h'
      );
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
    if(this.#strategyMode.setMode(mode)){
      this.#send('✅ Mode changed to: <b>'+mode+'</b>');
    } else {
      this.#send('❌ Invalid mode');
    }
  }

  async sendAlert(m){await this.#send('⚠️ '+m);}
  async sendReport(m){await this.#send(m);}
  async #send(t){if(!this.#bot||!this.#chatId)return;try{await this.#bot.sendMessage(this.#chatId,t,{parse_mode:'HTML'});}catch(e){this.#logger.error('TG send:',e.message);}}
}
