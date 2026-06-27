import TelegramBot from 'node-telegram-bot-api';
import { MessageFormatter } from './MessageFormatter.js';

export class TelegramService {
  #config; #logger; #eventBus; #tradeManager; #bot = null; #formatter; #chatId;
  constructor(config, logger, eventBus, tradeManager, database) {
    this.#config = config; this.#logger = logger; this.#eventBus = eventBus;
    this.#tradeManager = tradeManager; this.#formatter = new MessageFormatter();
    this.#chatId = config.telegram.chatId;
  }
  async initialize() {
    if (!this.#config.telegram.enabled) { this.#logger.info('Telegram disabled'); return; }
    try {
      this.#bot = new TelegramBot(this.#config.telegram.botToken, { polling: false });
      this.#eventBus.on('trade:opened', d => this.#send(this.#formatter.formatEntry(d)));
      this.#eventBus.on('trade:closed', d => this.#send(this.#formatter.formatExit(d)));
      await this.#send('🤖 AI Agent V4 Online');
      this.#logger.info('Telegram initialized');
    } catch (e) { this.#logger.error('Telegram init failed:', e.message); }
  }
  async sendAlert(msg) { await this.#send(`⚠️ ${msg}`); }
  async sendReport(msg) { await this.#send(msg); }
  async #send(text) {
    if (!this.#bot || !this.#chatId) return;
    try { await this.#bot.sendMessage(this.#chatId, text, { parse_mode: 'HTML' }); }
    catch (e) { this.#logger.error('Telegram send failed:', e.message); }
  }
}
