import { PositionManager } from './PositionManager.js';
import { EventEmitter } from 'events';

export class TradeManager extends EventEmitter {
  #config; #logger; #database; #exchange; #signalEngine; #riskEngine; #aiValidator; #eventBus;
  #positionManager; #isRunning = false; #loopInterval = null;

  constructor(config, logger, database, exchange, signalEngine, riskEngine, aiValidator, eventBus) {
    super();
    this.#config = config; this.#logger = logger; this.#database = database; this.#exchange = exchange;
    this.#signalEngine = signalEngine; this.#riskEngine = riskEngine; this.#aiValidator = aiValidator;
    this.#eventBus = eventBus; this.#positionManager = new PositionManager();
  }

  async initialize() {
    const p = this.#database.db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get();
    if (!p) this.#database.db.prepare('INSERT INTO portfolio (balance, equity) VALUES (?, ?)').run(this.#config.trading.startingBalance, this.#config.trading.startingBalance);
    const open = this.#database.db.prepare("SELECT * FROM positions WHERE status='open'").all();
    open.forEach(pos => this.#positionManager.track(pos));
    if (open.length) this.#logger.info(`Restored ${open.length} positions`);
    this.#startLoop();
    this.#logger.info('TradeManager initialized');
  }

  #startLoop() {
    this.#isRunning = true;
    this.#loopInterval = setInterval(async () => {
      if (!this.#isRunning) return;
      try { await this.#tick(); } catch (e) { this.#logger.error('Loop error:', e.message); }
    }, 60000);
  }

  async #tick() {
    await this.#monitor();
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
    const ticker = await this.#exchange.fetchTicker(this.#config.exchange.pair);
    const entry = ticker.last;
    const atr = signal.indicators?.primary?.indicators?.atr?.value || entry * 0.01;
    const levels = this.#riskEngine.calculateLevels(entry, atr, signal.side);
    const bal = this.#getBalance();
    const sizing = this.#riskEngine.calculatePositionSize(bal, entry, levels.stopLoss);
    const id = this.#genId();
    const pos = { id, pair: this.#config.exchange.pair, side: signal.side, entry_price: entry, quantity: sizing.quantity, leverage: sizing.leverage, stop_loss: levels.stopLoss, take_profit: levels.takeProfit, status: 'open', ai_confidence: ai.confidence, ai_decision: ai.decision, strategy_version: 'v4', open_time: new Date().toISOString() };
    this.#database.db.prepare("INSERT INTO positions (id,pair,side,entry_price,quantity,leverage,stop_loss,take_profit,status,ai_confidence,ai_decision,strategy_version,open_time) VALUES (@id,@pair,@side,@entry_price,@quantity,@leverage,@stop_loss,@take_profit,@status,@ai_confidence,@ai_decision,@strategy_version,@open_time)").run(pos);
    this.#positionManager.track({ ...pos, break_even_price: levels.breakEven });
    this.#eventBus.emit('trade:opened', { ...pos, riskAmount: sizing.riskAmount, confidence: ai.confidence });
    this.#logger.trade(`Opened: ${id} | ${signal.side} @ ${entry}`);
  }

  async #monitor() {
    const tracked = this.#positionManager.getAll();
    if (!tracked.length) return;
    const ticker = await this.#exchange.fetchTicker(this.#config.exchange.pair);
    const price = ticker.last;
    for (const pos of tracked) {
      try { await this.#check(pos, price); } catch (e) { this.#logger.error(`Check error [${pos.id}]:`, e.message); }
    }
  }

  async #check(pos, price) {
    const pnl = this.#calcPnl(pos, price);
    if (this.#stopped(pos, price)) { await this.#close(pos, price, 'stop_loss', pnl); return; }
    if (this.#tpHit(pos, price)) { await this.#close(pos, price, 'take_profit', pnl); return; }
    const holdMs = Date.now() - new Date(pos.open_time).getTime();
    if (holdMs > this.#config.risk.maxHoldHours * 3600000) { await this.#close(pos, price, 'max_hold', pnl); return; }
    if (!pos.break_even_applied && this.#riskEngine.shouldBreakEven(price, pos.entry_price, pos.break_even_price, pos.side)) {
      this.#positionManager.update(pos.id, { stop_loss: pos.entry_price, break_even_applied: true });
      this.#logger.trade(`Break even: ${pos.id}`);
    }
    const ts = this.#riskEngine.getTrailingStop(price, this.#estATR(pos), pos.side);
    if (pos.trailing_stop && ((pos.side === 'long' && price <= pos.trailing_stop) || (pos.side === 'short' && price >= pos.trailing_stop))) {
      await this.#close(pos, price, 'trailing_stop', pnl); return;
    }
    if (ts && (!pos.trailing_stop || (pos.side === 'long' && ts > pos.trailing_stop) || (pos.side === 'short' && ts < pos.trailing_stop))) {
      this.#positionManager.update(pos.id, { trailing_stop: ts });
    }
  }

  async #close(pos, price, reason, pnl) {
    const fees = price * pos.quantity * 0.0004;
    const slip = price * pos.quantity * 0.0001;
    const net = pnl - fees - slip;
    const roi = (net / (pos.entry_price * pos.quantity)) * 100;
    const hold = Date.now() - new Date(pos.open_time).getTime();
    this.#database.db.prepare("UPDATE positions SET exit_price=?,pnl=?,roi=?,fees=?,slippage=?,status='closed',exit_reason=?,close_time=datetime('now'),hold_duration=?,updated_at=datetime('now') WHERE id=?").run(price, net, roi, fees, slip, reason, hold, pos.id);
    this.#database.db.prepare("UPDATE portfolio SET balance=balance+?,realized_pnl=realized_pnl+?,daily_pnl=daily_pnl+?,weekly_pnl=weekly_pnl+?,monthly_pnl=monthly_pnl+?,total_trades=total_trades+1,winning_trades=winning_trades+CASE WHEN ?>0 THEN 1 ELSE 0 END,losing_trades=losing_trades+CASE WHEN ?<=0 THEN 1 ELSE 0 END,updated_at=datetime('now') WHERE id=(SELECT id FROM portfolio ORDER BY id DESC LIMIT 1)").run(net, net, net, net, net, net, net);
    this.#positionManager.remove(pos.id);
    if (net <= 0) await this.#riskEngine.recordLoss();
    this.#eventBus.emit('trade:closed', { ...pos, exitPrice: price, pnl: net, roi, reason, fees, slippage: slip, holdDuration: hold });
    this.#logger.trade(`Closed: ${pos.id} | ${reason} | PnL: $${net.toFixed(2)}`);
  }

  #calcPnl(p, c) { return (p.side === 'long' ? c - p.entry_price : p.entry_price - c) * p.quantity; }
  #stopped(p, c) { return p.side === 'long' ? c <= p.stop_loss : c >= p.stop_loss; }
  #tpHit(p, c) { return p.side === 'long' ? c >= p.take_profit : c <= p.take_profit; }
  #estATR(p) { return Math.abs(p.entry_price - p.stop_loss) / this.#config.indicators.atrSlMultiplier; }
  #getBalance() { const p = this.#database.db.prepare('SELECT balance FROM portfolio ORDER BY id DESC LIMIT 1').get(); return p?.balance || this.#config.trading.startingBalance; }
  #genId() { return `T-${Date.now().toString(36)}-${Math.random().toString(36).substring(2,8)}`.toUpperCase(); }

  async shutdown() { this.#isRunning = false; if (this.#loopInterval) { clearInterval(this.#loopInterval); this.#loopInterval = null; } this.#logger.info('TradeManager shutdown'); }
  getOpenPositions() { return this.#positionManager.getAll(); }
  getPortfolio() { return this.#database.db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get(); }
}
