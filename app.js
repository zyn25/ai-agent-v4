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

class App {
  #container;
  #logger;
  #isRunning = false;

  async start() {
    try {
      validateEnv();
      this.#container = new Container();
      await this.#registerServices();
      this.#logger = this.#container.resolve('logger');
      this.#logger.info('AI Agent V4 starting...');
      await this.#initializeServices();
      this.#isRunning = true;
      this.#setupGracefulShutdown();
      this.#logger.info('AI Agent V4 started successfully');
    } catch (error) {
      console.error('Fatal startup error:', error.message);
      process.exit(1);
    }
  }

  async #registerServices() {
    const config = new Config();
    const eventBus = new EventBus();
    const logger = new Logger(config);
    const database = new Database(config, logger);

    this.#container.register('config', config);
    this.#container.register('eventBus', eventBus);
    this.#container.register('logger', logger);
    this.#container.register('database', database);

    let exchange = null;
    const exchangeFactory = new ExchangeFactory(config, logger);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        exchange = await exchangeFactory.create();
        break;
      } catch (error) {
        logger.warn('Exchange attempt ' + attempt + '/3 failed: ' + error.message);
        if (attempt === 3) throw error;
        await new Promise(r => setTimeout(r, 5000 * attempt));
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

    const tradeManager = new TradeManager(config, logger, database, exchange, signalEngine, riskEngine, aiValidator, eventBus, strategyMode);
    this.#container.register('tradeManager', tradeManager);

    const telegram = new TelegramService(config, logger, eventBus, tradeManager, database, strategyMode);
    this.#container.register('telegram', telegram);

    const reportService = new ReportService(config, logger, database, telegram);
    this.#container.register('reportService', reportService);

    const healthMonitor = new HealthMonitor(config, logger, telegram, database, exchange, aiValidator);
    this.#container.register('healthMonitor', healthMonitor);

    const backupManager = new BackupManager(join(process.cwd(), 'storage', 'agent.db'), logger);
    this.#container.register('backupManager', backupManager);
  }

  async #initializeServices() {
    const database = this.#container.resolve('database');
    await database.initialize();

    const strategyMode = this.#container.resolve('strategyMode');
    strategyMode.loadFromDatabase();

    const telegram = this.#container.resolve('telegram');
    await telegram.initialize();

    const tradeManager = this.#container.resolve('tradeManager');
    await tradeManager.initialize();

    const reportService = this.#container.resolve('reportService');
    reportService.start();

    const healthMonitor = this.#container.resolve('healthMonitor');
    healthMonitor.start();

    const backupManager = this.#container.resolve('backupManager');
    backupManager.start();
  }

  #setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (!this.#isRunning) return;
      this.#isRunning = false;
      this.#logger.info('Received ' + signal + '. Shutting down...');
      try {
        this.#container.resolve('tradeManager').shutdown();
        this.#container.resolve('reportService').stop();
        this.#container.resolve('healthMonitor').stop();
        this.#container.resolve('backupManager').stop();
        await this.#container.resolve('database').close();
        this.#logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Shutdown error:', error);
        process.exit(1);
      }
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (error) => { this.#logger?.error('Uncaught:', error); });
    process.on('unhandledRejection', (reason) => { this.#logger?.error('Unhandled:', reason); });
  }
}

const app = new App();
app.start();
