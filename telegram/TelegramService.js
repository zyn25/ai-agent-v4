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
      this.#bot=new TelegramBot(this.#config.telegram.botToken,{polling:false});
      this.#eventBus.on('trade:opened',d=>this.#send(this.#fmt.formatEntry(d)));
      this.#eventBus.on('trade:closed',d=>this.#send(this.#fmt.formatExit(d)));
      await this.#send('🤖 <b>AI Agent V4 Online</b>\n\nTrading loop: 60s\nMode: Paper Trading');
      this.#logger.info('Telegram initialized (send-only mode)');
    } catch(e){this.#logger.error('TG init fail:',e.message);}
  }
  async sendAlert(m){await this.#send('⚠️ '+m);}
  async sendReport(m){await this.#send(m);}
  async #send(t){if(!this.#bot||!this.#chatId)return;try{await this.#bot.sendMessage(this.#chatId,t,{parse_mode:'HTML'});this.#logger.telegram('Message sent');}catch(e){this.#logger.error('TG send:',e.message);}}
}
