import TelegramBot from 'node-telegram-bot-api';
import { MessageFormatter } from './MessageFormatter.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { totalmem, freemem } from 'os';

export class TelegramService {
  #config; #logger; #eventBus; #tradeManager; #bot=null; #fmt; #chatId;
  #portRepo; #posRepo; #db; #lastRestart=0; #restartCount=0;

  constructor(c,l,eb,tm,db) {
    this.#config=c; this.#logger=l; this.#eventBus=eb; this.#tradeManager=tm;
    this.#fmt=new MessageFormatter(); this.#chatId=c.telegram.chatId;
    this.#portRepo=new PortfolioRepository(db); this.#posRepo=new PositionRepository(db);
    this.#db=db;
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
    this.#eventBus.on('trade:paused',d=>this.#send('⏸️ <b>TRADING PAUSED</b>\n\n'+d.reason));
    this.#eventBus.on('trade:resumed',()=>this.#send('▶️ <b>TRADING RESUMED</b>'));
  }

  #setupCommands() {
    // Basic
    this.#bot.onText(/\/start/,()=>this.#send(this.#helpText()));
    this.#bot.onText(/\/help/,()=>this.#send(this.#helpText()));

    // Info
    this.#bot.onText(/\/status/,()=>{const p=this.#portRepo.getCurrent();const pos=this.#posRepo.findOpen();this.#send(this.#fmt.formatDashboard(p,pos));});
    this.#bot.onText(/\/positions/,()=>this.#send(this.#fmt.formatOpenPositions(this.#posRepo.findOpen())));
    this.#bot.onText(/\/balance/,()=>this.#cmdBalance());
    this.#bot.onText(/\/trades/,()=>this.#cmdTrades());
    this.#bot.onText(/\/stats/,()=>this.#cmdStats());
    this.#bot.onText(/\/config/,()=>this.#cmdConfig());
    this.#bot.onText(/\/risk/,()=>this.#cmdRisk());
    this.#bot.onText(/\/health/,()=>this.#cmdHealth());
    this.#bot.onText(/\/equity/,()=>this.#cmdEquity());

    // Emergency Controls
    this.#bot.onText(/\/pause/,()=>{this.#tradeManager.pause('Manual Telegram command');this.#send('⏸️ Trading paused');});
    this.#bot.onText(/\/resume/,()=>{this.#tradeManager.resume();this.#send('▶️ Trading resumed');});
    this.#bot.onText(/\/closeall/,()=>{this.#tradeManager.closeAll('telegram_command');this.#send('🔴 Closing all positions...');});
    this.#bot.onText(/\/closelast/,()=>{this.#tradeManager.closeLast('telegram_command');this.#send('🔴 Closing last position...');});
  }

  #helpText() {
    return '📋 <b>COMMANDS</b>\n\n' +
      '📊 <b>Info:</b>\n' +
      '/status - Dashboard\n' +
      '/positions - Open positions\n' +
      '/balance - Account balance\n' +
      '/trades - Recent trades\n' +
      '/stats - Statistics\n' +
      '/equity - Equity curve\n\n' +
      '⚙️ <b>Settings:</b>\n' +
      '/config - Bot config\n' +
      '/risk - Risk settings\n' +
      '/health - System health\n\n' +
      '🚨 <b>Emergency:</b>\n' +
      '/pause - Pause trading\n' +
      '/resume - Resume trading\n' +
      '/closeall - Close all positions\n' +
      '/closelast - Close last position';
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
    const paused=this.#tradeManager.isPaused;
    this.#send('⚙️ <b>CONFIG</b>\n\nMode: '+c.trading.mode+'\nPair: '+c.exchange.pair+'\nLeverage: '+c.exchange.leverage+'x\nAI: '+(c.ai.enabled?'ON':'OFF')+'\nCooldown: '+c.risk.cooldownMinutes+'min\nStatus: '+(paused?'⏸️ PAUSED':'▶️ RUNNING'));
  }

  #cmdRisk() {
    const r=this.#config.risk;
    this.#send('🛡️ <b>RISK</b>\n\nRisk/Trade: '+r.riskPerTrade+'%\nMax Daily: '+r.maxDailyLoss+'%\nMax Pos: '+r.maxOpenPositions+'\nMax Hold: '+r.maxHoldHours+'h\nPartial TP: '+r.partialTpLevels.join('/')+'R\nPartial Size: '+r.partialTpSizes.join('/')+'%\nCooldown: '+r.cooldownMinutes+'min');
  }

  #cmdHealth() {
    const ram=Math.round(((totalmem()-freemem())/totalmem())*100);
    const up=Math.round(process.uptime());
    const h=Math.floor(up/3600); const m=Math.floor((up%3600)/60);
    const op=this.#posRepo.countOpen();
    const paused=this.#tradeManager.isPaused;
    this.#send('🏥 <b>HEALTH</b>\n\nRAM: '+ram+'%\nUptime: '+h+'h '+m+'m\nPositions: '+op+'\nStatus: '+(paused?'⏸️ PAUSED':'▶️ RUNNING')+'\nDB: ✅\nExchange: ✅');
  }

  #cmdEquity() {
    try {
      const eq=this.#db.prepare('SELECT * FROM equity_curve ORDER BY id DESC LIMIT 10').all();
      const p=this.#portRepo.getCurrent();
      if(!p){this.#send('No data');return;}
      let m='📈 <b>EQUITY CURVE</b>\n\n';
      m+='Balance: $'+p.balance.toFixed(2)+'\n';
      m+='Peak: $'+(p.peak_balance||p.balance).toFixed(2)+'\n';
      m+='Drawdown: '+(eq.length?eq[0].drawdown_pct.toFixed(2):'0.00')+'%\n\n';
      if(eq.length) {
        m+='<b>Recent:</b>\n';
        eq.reverse().forEach(e=>{
          const t=e.created_at.substring(5,16);
          m+='<code>'+t+' $'+e.equity.toFixed(2)+' DD:'+e.drawdown_pct.toFixed(1)+'%</code>\n';
        });
      }
      this.#send(m);
    } catch(e){this.#send('Equity error: '+e.message);}
  }

  async sendAlert(m){await this.#send('⚠️ '+m);}
  async sendReport(m){await this.#send(m);}
  async #send(t){if(!this.#bot||!this.#chatId)return;try{await this.#bot.sendMessage(this.#chatId,t,{parse_mode:'HTML'});}catch(e){this.#logger.error('TG send:',e.message);}}
}
