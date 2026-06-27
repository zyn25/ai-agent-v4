import { PositionManager } from './PositionManager.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { EventEmitter } from 'events';

export class TradeManager extends EventEmitter {
  #config; #logger; #database; #exchange; #signalEngine; #riskEngine; #aiValidator; #eventBus;
  #positionManager; #positionRepo; #portfolioRepo;
  #isRunning = false; #loopInterval = null; #reconnectAttempts = 0;

  constructor(config, logger, database, exchange, signalEngine, riskEngine, aiValidator, eventBus) {
    super();
    this.#config = config; this.#logger = logger; this.#database = database; this.#exchange = exchange;
    this.#signalEngine = signalEngine; this.#riskEngine = riskEngine; this.#aiValidator = aiValidator;
    this.#eventBus = eventBus;
    this.#positionManager = new PositionManager();
    this.#positionRepo = new PositionRepository(database.db);
    this.#portfolioRepo = new PortfolioRepository(database.db);
  }

  async initialize() {
    this.#portfolioRepo.initialize(this.#config.trading.startingBalance);
    const open = this.#positionRepo.findOpen();
    open.forEach(pos => this.#positionManager.track(pos));
    if (open.length) this.#logger.info(`Restored ${open.length} positions`);
    this.#startLoop();
    this.#logger.info('TradeManager initialized');
  }

  #startLoop() {
    this.#isRunning = true;
    this.#loopInterval = setInterval(async () => {
      if (!this.#isRunning) return;
      try { await this.#tick(); }
      catch (e) { this.#logger.error('Loop error:', e.message); }
    }, 60000);
    this.#logger.info('Trading loop started (60s)');
  }

  async #tick() {
    try {
      await this.#monitor();
      this.#reconnectAttempts = 0;
    } catch (e) {
      this.#logger.error('Monitor error:', e.message);
      if (e.message.includes('timeout') || e.message.includes('ECONNREFUSED') || e.message.includes('network')) {
        this.#reconnectAttempts++;
        this.#logger.warn(`Exchange reconnect attempt ${this.#reconnectAttempts}`);
        if (this.#reconnectAttempts >= 5) {
          this.#logger.error('Exchange unreachable. Pausing 5 min.');
          await this.#sleep(300000);
          this.#reconnectAttempts = 0;
        }
      }
      return;
    }

    const can = await this.#riskEngine.canTrade();
    if (!can.allowed) return;

    const signal = await this.#signalEngine.analyze();
    if (signal.side === 'neutral') return;

    this.#logger.trade(`Signal: ${signal.side} | Confidence: ${signal.confidence}%`);

    let ai = { decision: 'approve', confidence: signal.confidence };
    if (this.#config.ai.enabled) {
      ai = await this.#aiValidator.validate(signal);
      if (ai.decision !== 'approve') { this.#logger.ai(`AI rejected: ${ai.reason}`); return; }
    }
    await this.#execute(signal, ai);
  }

  async #execute(signal, ai) {
    try {
      const ticker = await this.#exchange.fetchTicker(this.#config.exchange.pair);
      const entry = ticker.last;
      const atr = signal.indicators?.primary?.indicators?.atr?.value || entry * 0.01;
      const levels = this.#riskEngine.calculateLevels(entry, atr, signal.side);
      const bal = this.#portfolioRepo.getCurrent()?.balance || this.#config.trading.startingBalance;
      const sizing = this.#riskEngine.calculatePositionSize(bal, entry, levels.stopLoss);

      if (sizing.quantity <= 0) { this.#logger.warn('Position size 0. Skipping.'); return; }
      if (sizing.marginRequired > bal) { this.#logger.warn(`Insufficient margin`); return; }

      const id = this.#genId();
      const pos = {
        id, pair: this.#config.exchange.pair, side: signal.side, entry_price: entry,
        quantity: sizing.quantity, leverage: sizing.leverage,
        stop_loss: levels.stopLoss, take_profit: levels.takeProfit,
        status: 'open', ai_confidence: ai.confidence, ai_decision: ai.decision,
        strategy_version: 'v4', open_time: new Date().toISOString()
      };

      this.#positionRepo.create(pos);
      this.#positionManager.track({ ...pos, break_even_price: levels.breakEven });

      this.#eventBus.emit('trade:opened', { ...pos, riskAmount: sizing.riskAmount, confidence: ai.confidence });
      this.#logger.trade(`Opened: ${id} | ${signal.side} @ ${entry} | Qty: ${sizing.quantity}`);
    } catch (e) { this.#logger.error('Execute error:', e.message); }
  }

  async #monitor() {
    const tracked = this.#positionManager.getAll();
    if (!tracked.length) return;
    const ticker = await this.#exchange.fetchTicker(this.#config.exchange.pair);
    const price = ticker.last;
    for (const pos of tracked) {
      try { await this.#check(pos, price); }
      catch (e) { this.#logger.error(`Check error [${pos.id}]:`, e.message); }
    }
  }

  async #check(pos, price) {
    const pnl = this.#calcPnl(pos, price);

    if (this.#stopped(pos, price)) { await this.#close(pos, price, 'stop_loss', pnl); return; }
    if (this.#tpHit(pos, price)) { await this.#close(pos, price, 'take_profit', pnl); return; }

    const holdMs = Date.now() - new Date(pos.open_time).getTime();
    if (holdMs > this.#config.risk.maxHoldHours * 3600000) { await this.#close(pos, price, 'max_hold', pnl); return; }

    if (!pos.break_even_applied && pos.break_even_price) {
      if (this.#riskEngine.shouldBreakEven(price, pos.entry_price, pos.break_even_price, pos.side)) {
        this.#positionManager.update(pos.id, { stop_loss: pos.entry_price, break_even_applied: true });
        this.#positionRepo.update(pos.id, { stop_loss: pos.entry_price, break_even_applied: 1 });
        this.#logger.trade(`Break even applied: ${pos.id}`);
      }
    }

    const atr = this.#estATR(pos);
    const ts = this.#riskEngine.getTrailingStop(price, atr, pos.side);
    if (pos.trailing_stop) {
      if ((pos.side === 'long' && price <= pos.trailing_stop) || (pos.side === 'short' && price >= pos.trailing_stop)) {
        await this.#close(pos, price, 'trailing_stop', pnl);
        return;
      }
    }
    if (ts && (!pos.trailing_stop || (pos.side === 'long' && ts > pos.trailing_stop) || (pos.side === 'short' && ts < pos.trailing_stop))) {
      this.#positionManager.update(pos.id, { trailing_stop: ts });
      this.#positionRepo.update(pos.id, { trailing_stop: ts });
    }
  }

  async #close(pos, price, reason, pnl) {
    const fees = price * pos.quantity * 0.0004;
    const slippage = price * pos.quantity * 0.0001;
    const net = pnl - fees - slippage;
    const roi = pos.entry_price > 0 && pos.quantity > 0 ? (net / (pos.entry_price * pos.quantity)) * 100 : 0;
    const hold = Date.now() - new Date(pos.open_time).getTime();

    this.#positionRepo.closePosition(pos.id, price, net, roi, fees, slippage, reason, hold);
    this.#portfolioRepo.updateBalance(net, net > 0);
    this.#portfolioRepo.updateWinRate();
    this.#positionManager.remove(pos.id);

    if (net <= 0) await this.#riskEngine.recordLoss();

    this.#eventBus.emit('trade:closed', { ...pos, exitPrice: price, pnl: net, roi, reason, fees, slippage, holdDuration: hold });
    this.#logger.trade(`Closed: ${pos.id} | ${reason} | PnL: $${net.toFixed(2)}`);
  }

  #calcPnl(p, c) { return (p.side === 'long' ? c - p.entry_price : p.entry_price - c) * p.quantity; }
  #stopped(p, c) { return p.side === 'long' ? c <= p.stop_loss : c >= p.stop_loss; }
  #tpHit(p, c) { return p.side === 'long' ? c >= p.take_profit : c <= p.take_profit; }
  #estATR(p) { return Math.abs(p.entry_price - p.stop_loss) / this.#config.indicators.atrSlMultiplier; }
  #genId() { return `T-${Date.now().toString(36)}-${Math.random().toString(36).substring(2,8)}`.toUpperCase(); }
  #sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async shutdown() {
    this.#isRunning = false;
    if (this.#loopInterval) { clearInterval(this.#loopInterval); this.#loopInterval = null; }
    this.#logger.info('TradeManager shutdown');
  }

  getOpenPositions() { return this.#positionManager.getAll(); }
  getPortfolio() { return this.#portfolioRepo.getCurrent(); }
}
