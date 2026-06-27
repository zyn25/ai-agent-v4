import TelegramBot from 'node-telegram-bot-api';
import { MessageFormatter } from './MessageFormatter.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';

export class TelegramService {
  #config; #logger; #eventBus; #tradeManager; #bot = null; #formatter; #chatId;
  #portfolioRepo; #positionRepo;

  constructor(config, logger, eventBus, tradeManager, database) {
    this.#config = config; this.#logger = logger; this.#eventBus = eventBus;
    this.#tradeManager = tradeManager; this.#formatter = new MessageFormatter();
    this.#chatId = config.telegram.chatId;
    this.#portfolioRepo = new PortfolioRepository(database.db);
    this.#positionRepo = new PositionRepository(database.db);
  }

  async initialize() {
    if (!this.#config.telegram.enabled) { this.#logger.info('Telegram disabled'); return; }
    try {
      this.#bot = new TelegramBot(this.#config.telegram.botToken, { polling: true });
      this.#setupEventListeners();
      this.#setupCommands();
      this.#bot.on('polling_error', (error) => { this.#logger.error('Telegram polling error:', error.message); });
      this.#logger.info('Telegram initialized');
    } catch (e) { this.#logger.error('Telegram init failed:', e.message); }
  }

  #setupEventListeners() {
    this.#eventBus.on('trade:opened', d => this.#send(this.#formatter.formatEntry(d)));
    this.#eventBus.on('trade:closed', d => this.#send(this.#formatter.formatExit(d)));
  }

  #setupCommands() {
    if (!this.#bot) return;
    this.#bot.onText(/\/start/, () => this.#send('🤖 <b>AI Agent V4</b>\n\n/status - Dashboard\n/positions - Open positions'));
    this.#bot.onText(/\/status/, () => {
      const p = this.#portfolioRepo.getCurrent();
      const pos = this.#positionRepo.findOpen();
      this.#send(this.#formatter.formatDashboard(p, pos));
    });
    this.#bot.onText(/\/positions/, () => {
      const pos = this.#positionRepo.findOpen();
      this.#send(this.#formatter.formatOpenPositions(pos));
    });
    this.#bot.onText(/\/stats/, () => {
      const stats = this.#positionRepo.getStats();
      this.#send(this.#formatStats(stats));
    });
  }

  #formatStats(s) {
    const wr = s.total > 0 ? ((s.wins / s.total) * 100).toFixed(1) : '0.0';
    const pf = s.losses > 0 ? (Math.abs(s.total_pnl / s.worst_trade)).toFixed(2) : 'N/A';
    return `📈 <b>ALL-TIME STATS</b>\n\nTrades: ${s.total}\nWins: ${s.wins}\nLosses: ${s.losses}\nWin Rate: ${wr}%\nTotal PnL: $${s.total_pnl.toFixed(2)}\nBest: $${s.best_trade.toFixed(2)}\nWorst: $${s.worst_trade.toFixed(2)}\nAvg PnL: $${s.avg_pnl.toFixed(2)}`;
  }

  async sendAlert(msg) { await this.#send(`⚠️ ALERT\n\n${msg}`); }
  async sendReport(msg) { await this.#send(msg); }

  async #send(text) {
    if (!this.#bot || !this.#chatId) return;
    try { await this.#bot.sendMessage(this.#chatId, text, { parse_mode: 'HTML' }); }
    catch (e) { this.#logger.error('Telegram send failed:', e.message); }
  }
}
