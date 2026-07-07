import 'dotenv/config';
import { Config } from './config/index.js';
import { validateEnv } from './config/validator.js';
import { Container } from './core/Container.js';
import { Logger } from './core/Logger.js';
import { Database } from './database/Database.js';
import { EventBus } from './core/EventBus.js';
import { ExchangeFactory } from './exchange/ExchangeFactory.js';
import { MarketDataService } from './exchange/MarketDataService.js';
import { SignalEngine } from './strategy/SignalEngine.js';
import { RiskEngine } from './risk/RiskEngine.js';
import { TradeManager } from './trade/TradeManager.js';
import { TelegramService } from './telegram/TelegramService.js';
import { AIValidator } from './ai/AIValidator.js';
import { ReportService } from './reports/ReportService.js';
import { HealthMonitor } from './monitor/HealthMonitor.js';
import { BackupManager } from './database/BackupManager.js';
import { StrategyMode } from './strategy/StrategyMode.js';
import { join } from 'path';
import { mkdirSync } from 'fs';

class App {
  #container;
  #logger;
  #isRunning = false;
  #isStarting = false;
  #isShuttingDown = false;
  #MAX_ATTEMPTS = 3;

  async start() {
    if (this.#isStarting || this.#isShuttingDown || this.#isRunning) return;
    this.#isStarting = true;

    try {
      validateEnv();
      this.#container = new Container();

      const config = new Config();
      const eventBus = new EventBus();
      const logger = new Logger(config);

      this.#container.register('config', config);
      this.#container.register('eventBus', eventBus);
      this.#container.register('logger', logger);
      this.#logger = logger;

      this.#logger.info('AI Agent V4 starting...');

      await this.#registerServices();
      await this.#initializeServices();

      this.#isRunning = true;
      this.#isStarting = false;

      this.#setupGracefulShutdown();
      this.#logger.info('AI Agent V4 started successfully');
    } catch (error) {
      this.#isStarting = false;
      console.error('Fatal startup error:', error.message);
      if (this.#logger) {
        this.#logger.error('Fatal startup error: ' + error.message);
      }
      try {
        const database = this.#container?.resolve('database');
        if (database) await database.close();
      } catch (e) { /* ignore close errors during startup failure */ }
      process.exit(1);
    }
  }

  async #registerServices() {
    const config = this.#container.resolve('config');
    const logger = this.#container.resolve('logger');
    const eventBus = this.#container.resolve('eventBus');

    const database = new Database(config, logger);
    this.#container.register('database', database);

    let exchange = null;
    const exchangeFactory = new ExchangeFactory(config, logger);

    for (let attempt = 1; attempt <= this.#MAX_ATTEMPTS; attempt++) {
      try {
        exchange = await exchangeFactory.create();
        if (!exchange || typeof exchange !== 'object') {
          throw new Error('ExchangeFactory returned null or invalid object');
        }
        logger.info('Exchange connected successfully');
        break;
      } catch (error) {
        logger.warn('Exchange attempt ' + attempt + '/' + this.#MAX_ATTEMPTS + ' failed: ' + error.message);
        if (attempt === this.#MAX_ATTEMPTS) throw error;
        const backoff = 5000 * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    this.#container.register('exchange', exchange);

    const marketData = new MarketDataService(exchange, config, logger);
    this.#container.register('marketData', marketData);

    const strategyMode = new StrategyMode(logger, database);
    this.#container.register('strategyMode', strategyMode);

    const signalEngine = new SignalEngine(config, logger, marketData, strategyMode);
    this.#container.register('signalEngine', signalEngine);

    const riskEngine = new RiskEngine(config, logger, database);
    this.#container.register('riskEngine', riskEngine);

    const aiValidator = new AIValidator(config, logger);
    this.#container.register('aiValidator', aiValidator);

    const tradeManager = new TradeManager(
      config, logger, database, exchange, signalEngine, riskEngine, aiValidator, eventBus, strategyMode
    );
    this.#container.register('tradeManager', tradeManager);

    const telegram = new TelegramService(
      config, logger, eventBus, tradeManager, database, strategyMode
    );
    this.#container.register('telegram', telegram);

    const reportService = new ReportService(config, logger, database, telegram);
    this.#container.register('reportService', reportService);

    const healthMonitor = new HealthMonitor(config, logger, telegram, database, exchange, aiValidator);
    this.#container.register('healthMonitor', healthMonitor);

    const backupDir = join(process.cwd(), 'storage');
    try { mkdirSync(backupDir, { recursive: true }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const backupManager = new BackupManager(join(backupDir, 'agent.db'), logger);
    this.#container.register('backupManager', backupManager);
  }

  async #initializeServices() {
    const logger = this.#logger;

    const database = this.#container.resolve('database');
    for (let i = 1; i <= this.#MAX_ATTEMPTS; i++) {
      try {
        await database.initialize();
        logger.info('Database initialized successfully');
        break;
      } catch (error) {
        logger.error('DB init attempt ' + i + '/' + this.#MAX_ATTEMPTS + ' failed: ' + error.message);
        if (i === this.#MAX_ATTEMPTS) throw new Error('Database init failed after retries');
        await new Promise(r => setTimeout(r, 5000 * i));
      }
    }

    const strategyMode = this.#container.resolve('strategyMode');
    strategyMode.loadFromDatabase();

    const telegram = this.#container.resolve('telegram');
    await telegram.initialize();

    const tradeManager = this.#container.resolve('tradeManager');
    await tradeManager.initialize();

    this.#container.resolve('reportService').start();
    this.#container.resolve('healthMonitor').start();
    this.#container.resolve('backupManager').start();
  }

  // FIX: Use arrow functions in setupGracefulShutdown instead of binding private methods
  #setupGracefulShutdown() {
    const self = this;

    const handleSignal = async (signal) => {
      if (self.#isShuttingDown) return;
      self.#logger?.info('Received ' + signal + '. Shutting down gracefully...');
      await self.#shutdown();
    };

    const handleFatalError = async (type, payload) => {
      if (self.#isShuttingDown) return;
      self.#logger?.error(type + ':', payload);
      await self.#shutdown(true);
      process.exit(1);
    };

    process.once('SIGTERM', () => handleSignal('SIGTERM'));
    process.once('SIGINT', () => handleSignal('SIGINT'));
    process.once('uncaughtException', (err) => handleFatalError('Uncaught exception', err));
    process.once('unhandledRejection', (reason) => handleFatalError('Unhandled rejection', reason));
  }

  async #shutdown(isFatal = false) {
    if (this.#isShuttingDown || (!this.#isRunning && !isFatal)) return;
    this.#isShuttingDown = true;
    this.#isRunning = false;

    try {
      const telegram = this.#container.resolve('telegram');
      const tradeManager = this.#container.resolve('tradeManager');
      const reportService = this.#container.resolve('reportService');
      const healthMonitor = this.#container.resolve('healthMonitor');
      const backupManager = this.#container.resolve('backupManager');
      const database = this.#container.resolve('database');

      const results = await Promise.allSettled([
        telegram?.shutdown?.() ?? Promise.resolve(),
        tradeManager?.shutdown?.(),
        reportService?.stop?.(),
        healthMonitor?.stop?.(),
        backupManager?.stop?.()
      ]);

      results.forEach((res, idx) => {
        if (res.status === 'rejected') {
          this.#logger?.error('Shutdown step [' + idx + '] failed:', res.reason);
        }
      });

      await database?.close?.();
      this.#logger?.info('Shutdown complete');

      if (!isFatal) process.exit(0);
    } catch (error) {
      this.#logger?.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

const app = new App();
app.start();
