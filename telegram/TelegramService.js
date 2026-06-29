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
  #lastRestart=0; #restartCount=0; #startTime;

  constructor(c,l,eb,tm,db,strategyMode) {
    this.#config=c; this.#logger=l; this.#eventBus=eb; this.#tradeManager=tm;
    this.#fmt=new MessageFormatter(); this.#chatId=c.telegram.chatId;
    this.#portRepo=new PortfolioRepository(db); this.#posRepo=new PositionRepository(db);
    this.#db=db; this.#sizer=new PositionSizer(c);
    this.#journal=new TradeJournal(db,l); this.#analytics=new PerformanceAnalytics(db,l);
    this.#strategyMode=strategyMode; this.#startTime=Date.now();
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
    return '📋 <b>COMMANDS</b>\n\n📊 <b>Info:</b>\n/status /positions /balance /trades /stats /equity\n\n📈 <b>Analysis:</b>\n/orderbook /kelly /summary /analytics /journal\n\n⚙️ <b>Settings:</b>\n/config /risk /health /mode\n\n🎯 <b>Strategy:</b>\n/aggressive /balanced /conservative /scalping\n\n🚨 <b>Emergency:</b>\n/pause /resume /closeall /closelast';
  }

  async #cmdStatus() {
    try {
      const p = this.#portRepo.getCurrent();
      const pos = this.#posRepo.findOpen();
      const prices = await this.#fetchPrices();
      const s = this.#posRepo.getStats();

      const pf = s && s.total > 0 && s.losses > 0 ? (Math.abs(s.total_pnl) / Math.abs(s.worst_trade || 1)).toFixed(2) : 'N/A';
      const avgHoldMs = s && s.total > 0 ? (s.avg_hold_duration || 0) : 0;
      const avgHoldH = avgHoldMs > 0 ? (avgHoldMs / 3600000).toFixed(1) + 'h' : 'N/A';

      let floatingPnl = 0;
      let posLines = '';
      if (pos && pos.length && prices) {
        for (const position of pos) {
          const cp = prices[position.pair];
          if (!cp) continue;
          const qty = position.remaining_quantity || position.quantity;
          const pnl = position.side === 'long' ? (cp - position.entry_price) * qty : (position.entry_price - cp) * qty;
          const pct = (pnl / (position.entry_price * qty)) * 100;
          floatingPnl += pnl;
          posLines += (pnl >= 0 ? '🟢' : '🔴') + ' <code>' + position.pair + '</code> <code>' + (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) + ' (' + (pnl >= 0 ? '+' : '') + pct.toFixed(2) + '%)</code>\n';
        }
      }

      const totalEquity = (p?.balance || 0) + floatingPnl;
      const ddPct = p?.peak_balance > 0 ? ((p.peak_balance - totalEquity) / p.peak_balance * 100) : 0;

      this.#send(
        '📊 <b>DASHBOARD</b>\n\n' +
        'Balance:       <code>$' + (p?.balance || 0).toFixed(2) + '</code>\n' +
        'Equity:        <code>$' + totalEquity.toFixed(2) + '</code>\n' +
        'Floating:      <code>' + (floatingPnl >= 0 ? '+' : '') + '$' + floatingPnl.toFixed(2) + '</code>\n' +
        'Realized:      <code>$' + (p?.realized_pnl || 0).toFixed(2) + '</code>\n' +
        'Daily PnL:     <code>' + ((p?.daily_pnl || 0) >= 0 ? '+' : '') + '$' + (p?.daily_pnl || 0).toFixed(2) + '</code>\n' +
        'Weekly:        <code>' + ((p?.weekly_pnl || 0) >= 0 ? '+' : '') + '$' + (p?.weekly_pnl || 0).toFixed(2) + '</code>\n' +
        'DD:            <code>' + ddPct.toFixed(2) + '%</code>\n' +
        'Win Rate:      <code>' + (p?.win_rate || 0).toFixed(1) + '%</code>\n' +
        'Profit Factor: <code>' + pf + '</code>\n' +
        'Avg Hold:      <code>' + avgHoldH + '</code>\n' +
        'Open:          <code>' + (pos ? pos.length : 0) + '</code>\n\n' +
        (posLines ? '📈 <b>POSITIONS:</b>\n' + posLines + '\n' : '') +
        '🕐 ' + this.#ts()
      );
    } catch(e) { this.#send('Status error: ' + e.message); }
  }

  async #cmdPositions() {
    try {
      const pos = this.#posRepo.findOpen();
      const prices = await this.#fetchPrices();
      this.#send(this.#fmt.formatOpenPositions(pos, prices));
    } catch(e) { this.#send(this.#fmt.formatOpenPositions(this.#posRepo.findOpen(), null)); }
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
    t.forEach(x=>{
      const pnlStr = (x.pnl>=0?'+':'') + '$' + (x.pnl||0).toFixed(2);
      const emoji = x.status==='open' ? '🟢' : (x.pnl>0?'💰':'💸');
      m+=emoji+' '+x.id+' | '+x.side+' | '+pnlStr+' | '+(x.exit_reason||'open')+'\n';
    });
    this.#send(m);
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

  #cmdHealth() {
    const ram=Math.round(((totalmem()-freemem())/totalmem())*100);
    const up=Math.round((Date.now()-this.#startTime)/1000);
    const h=Math.floor(up/3600); const m=Math.floor((up%3600)/60);
    this.#send('🏥 <b>HEALTH</b>\n\nRAM: '+ram+'%\nUptime: '+h+'h '+m+'m\nPositions: '+this.#posRepo.countOpen()+'\nMode: '+this.#strategyMode.getModeName()+'\nStatus: '+(this.#tradeManager.isPaused?'⏸️ PAUSED':'▶️ RUNNING')+'\nExchange: ✅\nTelegram: ✅\nAI: '+(this.#config.ai.enabled?'✅':'❌')+'\nDB: ✅');
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
        '📊 <b>ANALYTICS</b>\n\n' +
        'Trades: '+a.totalTrades+' | W: '+a.wins+' | L: '+a.losses+'\n' +
        'Win Rate: '+a.winRate+'%\n' +
        'PnL: $'+a.totalPnl+'\n' +
        'PF: '+a.profitFactor+'\n' +
        'Expectancy: $'+a.expectancy+'/trade\n' +
        'Sharpe: '+a.sharpeRatio+'\n' +
        'Sortino: '+a.sortinoRatio+'\n' +
        'Max DD: '+a.maxDrawdownPct+'%\n' +
        'Win Streak: '+a.maxWinStreak+' | Loss Streak: '+a.maxLossStreak+'\n' +
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
  #ts(){return new Date().toISOString().replace('T',' ').substring(0,19);}
  async #send(t){if(!this.#bot||!this.#chatId)return;try{await this.#bot.sendMessage(this.#chatId,t,{parse_mode:'HTML'});}catch(e){this.#logger.error('TG send:',e.message);}}
}
