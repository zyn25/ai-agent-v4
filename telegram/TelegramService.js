import TelegramBot from 'node-telegram-bot-api';
import { MessageFormatter } from './MessageFormatter.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { PositionSizer } from '../risk/PositionSizer.js';
import { TradeJournal } from '../reports/TradeJournal.js';
import { totalmem, freemem } from 'os';

export class TelegramService {
  #config; #logger; #eventBus; #tradeManager; #bot=null; #fmt; #chatId;
  #portRepo; #posRepo; #db; #sizer; #journal; #lastRestart=0; #restartCount=0;

  constructor(c,l,eb,tm,db) {
    this.#config=c; this.#logger=l; this.#eventBus=eb; this.#tradeManager=tm;
    this.#fmt=new MessageFormatter(); this.#chatId=c.telegram.chatId;
    this.#portRepo=new PortfolioRepository(db); this.#posRepo=new PositionRepository(db);
    this.#db=db; this.#sizer=new PositionSizer(c);
    this.#journal=new TradeJournal(db,l);
  }

  async initialize() {
    if(!this.#config.telegram.enabled){this.#logger.info('Telegram disabled');return;}
    try {
      this.#bot=new TelegramBot(this.#config.telegram.botToken,{polling:{interval:5000,params:{timeout:30},autoStart:true}});
      this.#bot.on('polling_error',(e)=>{
        const now=Date.now();
        if(now-this.#lastRestart>60000&&this.#restartCount<3){
          this.#lastRestart=now; this.#restartCount++;
          this.#logger.warn('TG polling restart #'+this.#restartCount);
          setTimeout(()=>{try{this.#bot.stopPolling();}catch{} setTimeout(()=>{try{this.#bot.startPolling();}catch{}},5000);},5000);
        }
      });
      this.#setupEvents();
      this.#setupCommands();
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
  }

  #helpText() {
    return '📋 <b>COMMANDS</b>\n\n' +
      '📊 <b>Info:</b>\n/status /positions /balance /trades /stats /equity\n\n' +
      '📈 <b>Analysis:</b>\n/orderbook /kelly /summary /journal\n\n' +
      '⚙️ <b>Settings:</b>\n/config /risk /health\n\n' +
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
    this.#send('⚙️ <b>CONFIG</b>\n\nMode: '+c.trading.mode+'\nPairs: '+c.pairs.join(', ')+'\nLeverage: '+c.exchange.leverage+'x\nAI: '+(c.ai.enabled?'ON':'OFF')+'\nCooldown: '+c.risk.cooldownMinutes+'min\nStatus: '+(this.#tradeManager.isPaused?'⏸️ PAUSED':'▶️ RUNNING'));
  }

  #cmdRisk() {
    const r=this.#config.risk;
    this.#send('🛡️ <b>RISK</b>\n\nRisk/Trade: '+r.riskPerTrade+'%\nMax Daily: '+r.maxDailyLoss+'%\nMax Pos: '+r.maxOpenPositions+'\nMax Hold: '+r.maxHoldHours+'h\nPartial TP: '+r.partialTpLevels.join('/')+'R\nCooldown: '+r.cooldownMinutes+'min');
  }

  #cmdHealth() {
    const ram=Math.round(((totalmem()-freemem())/totalmem())*100);
    const up=Math.round(process.uptime());
    const h=Math.floor(up/3600); const m=Math.floor((up%3600)/60);
    this.#send('🏥 <b>HEALTH</b>\n\nRAM: '+ram+'%\nUptime: '+h+'h '+m+'m\nPositions: '+this.#posRepo.countOpen()+'\nStatus: '+(this.#tradeManager.isPaused?'⏸️ PAUSED':'▶️ RUNNING')+'\nDB: ✅\nExchange: ✅');
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
      await this.#send('⏳ Fetching orderbook...');
      const ob=await this.#tradeManager.orderbook.analyze(this.#config.exchange.pair);
      if(!ob){this.#send('❌ Orderbook error');return;}
      this.#send('📖 <b>ORDERBOOK</b>\n\nPair: '+ob.pair+'\nMid: $'+ob.midPrice.toFixed(2)+'\nSpread: '+ob.spreadPercent.toFixed(4)+'%\nBid Vol: '+ob.bidVolume.toFixed(2)+'\nAsk Vol: '+ob.askVolume.toFixed(2)+'\nRatio: '+ob.bidAskRatio.toFixed(2)+'\nBias: '+ob.bias+'\nLiquidity: '+ob.liquidity);
    } catch(e){this.#send('Orderbook error');}
  }

  #cmdKelly() {
    const trades=this.#db.prepare("SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 50").all();
    const p=this.#portRepo.getCurrent();
    const bal=p?p.balance:this.#config.trading.startingBalance;
    const k=this.#sizer.calculateKelly(trades,bal);
    this.#send('🎯 <b>KELLY</b>\n\nTrades: '+(trades?trades.length:0)+'\nWin Rate: '+(k.winRate||'N/A')+'\nPayoff: '+(k.payoffRatio||'N/A')+'\nKelly: '+(k.kelly||'N/A')+'\nRecommended: '+(k.sizePercent||'0.50')+'%\nConfidence: '+(k.confidence||'low'));
  }

  #cmdSummary() {
    try {
      const summary = this.#journal.getPerformanceSummary(30);
      if(!summary){this.#send('No trades yet');return;}
      this.#send(
        '📊 <b>30-DAY SUMMARY</b>\n\n' +
        'Trades: '+summary.totalTrades+'\n' +
        'Win Rate: '+summary.winRate+'\n' +
        'PnL: $'+summary.totalPnl+'\n' +
        'Profit Factor: '+summary.profitFactor+'\n' +
        'Sharpe: '+summary.sharpeRatio+'\n' +
        'Sortino: '+summary.sortinoRatio+'\n' +
        'Max DD: $'+summary.maxDrawdown+'\n' +
        'Best: $'+summary.bestTrade+'\n' +
        'Worst: $'+summary.worstTrade+'\n' +
        'Avg Hold: '+summary.avgHoldHours+'h\n' +
        'Win Streak: '+summary.maxWinStreak+'\n' +
        'Loss Streak: '+summary.maxLossStreak
      );
    } catch(e){this.#send('Summary error: '+e.message);}
  }

  #cmdJournal() {
    try {
      const result = this.#journal.exportToCSV(30);
      if(!result){this.#send('No trades to export');return;}
      this.#send('📄 <b>JOURNAL EXPORTED</b>\n\nFile: '+result.filepath+'\nTrades: '+result.count);
    } catch(e){this.#send('Journal error');}
  }

  async sendAlert(m){await this.#send('⚠️ '+m);}
  async sendReport(m){await this.#send(m);}
  async #send(t){if(!this.#bot||!this.#chatId)return;try{await this.#bot.sendMessage(this.#chatId,t,{parse_mode:'HTML'});}catch(e){this.#logger.error('TG send:',e.message);}}
}
