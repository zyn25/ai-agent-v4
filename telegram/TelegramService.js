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
      // FIX: Enable polling for commands to work
      this.#bot = new TelegramBot(this.#config.telegram.botToken, { polling: true });
      this.#setupEventListeners();
      this.#setupCommands();
      this.#logger.info('Telegram initialized with polling');
    } catch (e) { this.#logger.error('Telegram init failed:', e.message); }
  }

  #setupEventListeners() {
    this.#eventBus.on('trade:opened', d => this.#send(this.#formatter.formatEntry(d)));
    this.#eventBus.on('trade:closed', d => this.#send(this.#formatter.formatExit(d)));
  }

  #setupCommands() {
    if (!this.#bot) return;
    this.#bot.onText(/\/start/, () => this.#send('🤖 AI Agent V4 Online\n\n/status - Dashboard\n/positions - Open positions'));
    this.#bot.onText(/\/status/, () => {
      const p = this.#tradeManager.getPortfolio();
      const pos = this.#tradeManager.getOpenPositions();
      this.#send(this.#formatter.formatDashboard(p, pos));
    });
    this.#bot.onText(/\/positions/, () => {
      const pos = this.#tradeManager.getOpenPositions();
      this.#send(this.#formatter.formatOpenPositions(pos));
    });
    // FIX: Handle polling errors
    this.#bot.on('polling_error', (error) => {
      this.#logger.error('Telegram polling error:', error.message);
    });
  }

  async sendAlert(msg) { await this.#send(`⚠️ ALERT\n\n${msg}`); }
  async sendReport(msg) { await this.#send(msg); }

  async #send(text) {
    if (!this.#bot || !this.#chatId) return;
    try {
      await this.#bot.sendMessage(this.#chatId, text, { parse_mode: 'HTML' });
    } catch (e) {
      this.#logger.error('Telegram send failed:', e.message);
    }
  }
}
