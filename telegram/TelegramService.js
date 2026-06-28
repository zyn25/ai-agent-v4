import TelegramBot from 'node-telegram-bot-api';
import { MessageFormatter } from './MessageFormatter.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';

export class TelegramService {
  #config; #logger; #eventBus; #tradeManager; #bot=null; #fmt; #chatId; #portRepo; #posRepo;
  constructor(c,l,eb,tm,db) {
    this.#config=c; this.#logger=l; this.#eventBus=eb; this.#tradeManager=tm;
    this.#fmt=new MessageFormatter(); this.#chatId=c.telegram.chatId;
    this.#portRepo=new PortfolioRepository(db); this.#posRepo=new PositionRepository(db);
  }
  async initialize() {
    if(!this.#config.telegram.enabled){this.#logger.info('Telegram disabled');return;}
    try {
      this.#bot=new TelegramBot(this.#config.telegram.botToken,{polling:true});
      this.#eventBus.on('trade:opened',d=>this.#send(this.#fmt.formatEntry(d)));
      this.#eventBus.on('trade:closed',d=>this.#send(this.#fmt.formatExit(d)));
      this.#bot.onText(/\/start/,()=>this.#send('🤖 <b>AI Agent V4</b>\n\n/status\n/positions\n/stats'));
      this.#bot.onText(/\/status/,()=>{const p=this.#portRepo.getCurrent();const pos=this.#posRepo.findOpen();this.#send(this.#fmt.formatDashboard(p,pos));});
      this.#bot.onText(/\/positions/,()=>{this.#send(this.#fmt.formatOpenPositions(this.#posRepo.findOpen()));});
      this.#bot.onText(/\/stats/,()=>{const s=this.#posRepo.getStats();if(!s||!s.total){this.#send('No trades yet.');return;}const wr=s.total>0?((s.wins/s.total)*100).toFixed(1):'0';this.#send('📈 <b>STATS</b>\n\nTrades: '+s.total+'\nWins: '+s.wins+'\nWin Rate: '+wr+'%\nPnL: $'+s.total_pnl.toFixed(2));});
      this.#bot.on('polling_error',e=>this.#logger.error('TG poll:',e.message));
      this.#logger.info('Telegram initialized');
    } catch(e){this.#logger.error('TG init fail:',e.message);}
  }
  async sendAlert(m){await this.#send('⚠️ '+m);}
  async sendReport(m){await this.#send(m);}
  async #send(t){if(!this.#bot||!this.#chatId)return;try{await this.#bot.sendMessage(this.#chatId,t,{parse_mode:'HTML'});}catch(e){this.#logger.error('TG send:',e.message);}}
}
