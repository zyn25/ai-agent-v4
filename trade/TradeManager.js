import { PositionManager } from './PositionManager.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { OrderbookAnalyzer } from '../strategy/OrderbookAnalyzer.js';
import { MarketFilter } from '../strategy/MarketFilter.js';
import { SessionFilter } from '../strategy/SessionFilter.js';
import { CorrelationChecker } from '../strategy/CorrelationChecker.js';
import { OrderDeduplicator } from './OrderDeduplicator.js';
import { LifecycleLogger } from './LifecycleLogger.js';
import { withRetry } from '../utils/retry.js';
import { TRADING, TIMING } from '../utils/constants.js';
import { EventEmitter } from 'events';

/**
 * Trade manager - orchestrates the complete trading loop.
 */
export class TradeManager extends EventEmitter {
  #config; #logger; #db; #exchange; #signalEngine; #riskEngine; #aiValidator; #eventBus;
  #pm; #posRepo; #portRepo; #orderbook; #marketFilter; #sessionFilter;
  #correlationChecker; #deduplicator; #strategyMode; #lifecycle;
  #running = false; #loop = null; #reconnect = 0;
  #paused = false; #pauseReason = ''; #lastTradeTime = 0;

  constructor(c, l, db, ex, se, re, av, eb, sm) {
    super();
    this.#config = c; this.#logger = l; this.#db = db; this.#exchange = ex;
    this.#signalEngine = se; this.#riskEngine = re; this.#aiValidator = av; this.#eventBus = eb;
    this.#strategyMode = sm;
    this.#pm = new PositionManager();
    this.#posRepo = new PositionRepository(db);
    this.#portRepo = new PortfolioRepository(db);
    this.#orderbook = new OrderbookAnalyzer(ex, l);
    this.#marketFilter = new MarketFilter(c, l);
    this.#sessionFilter = new SessionFilter(c, l);
    this.#correlationChecker = new CorrelationChecker(db, l);
    this.#deduplicator = new OrderDeduplicator(c);
    this.#lifecycle = new LifecycleLogger(db, l);
  }

  async initialize() {
    this.#portRepo.initialize(this.#config.trading.startingBalance);
    const open = this.#posRepo.findOpen();
    open.forEach(p => this.#pm.track(p));
    if (open.length) this.#logger.info('Restored ' + open.length + ' positions');
    this.#running = true;
    this.#startLoop();
    this.#startEquityTracking();
    this.#logger.info('TradeManager initialized (pairs: ' + this.#config.pairs.join(', ') + ')');
  }

  #startLoop() {
    this.#loop = setInterval(async () => {
      if (!this.#running || this.#paused) return;
      try { await this.#tick(); }
      catch (e) { this.#logger.error('Loop:', e.message); }
    }, TIMING.TRADING_LOOP_MS);
  }

  #startEquityTracking() {
    setInterval(() => {
      try {
        const p = this.#portRepo.getCurrent();
        if (!p) return;
        const open = this.#posRepo.findOpen();
        let unrealized = 0;
        for (const pos of open) { unrealized += (pos.unrealized_pnl || 0); }
        const equity = p.balance + unrealized;
        const peak = Math.max(p.peak_balance || p.balance, equity);
        const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
        this.#db.prepare(
          'INSERT INTO equity_curve (balance, equity, drawdown, drawdown_pct, peak_balance, open_positions) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(p.balance, equity, peak - equity, dd, peak, open.length);

        // FIX: Cleanup old equity data (keep last 7 days only)
        this.#db.prepare(
          "DELETE FROM equity_curve WHERE created_at < datetime('now', '-7 days')"
        ).run();
      } catch (e) {}
    }, TIMING.EQUITY_TRACK_MS);
  }

  // ===== EMERGENCY CONTROLS =====
  pause(reason) {
    this.#paused = true;
    this.#pauseReason = reason || 'Manual';
    this.#logger.warn('PAUSED: ' + this.#pauseReason);
    this.#eventBus.emit('trade:paused', { reason: this.#pauseReason });
  }

  resume() {
    this.#paused = false;
    this.#pauseReason = '';
    this.#logger.info('RESUMED');
    this.#eventBus.emit('trade:resumed', {});
  }

  get isPaused() { return this.#paused; }
  get pauseReason() { return this.#pauseReason; }

  async closeAll(reason) {
    const open = this.#pm.getAll();
    this.#logger.warn('EMERGENCY: Closing ' + open.length + ' positions');
    for (const pos of open) {
      try {
        const tk = await withRetry(() => this.#exchange.fetchTicker(pos.pair));
        const price = this.#validatePrice(tk.last);
        if (!price) continue;
        const pnl = this.#calcPnl(pos, price);
        await this.#close(pos, price, 'emergency_' + reason, pnl);
      } catch (e) { this.#logger.error('Close error ' + pos.id); }
    }
    this.pause('Emergency: ' + reason);
  }

  async closeLast(reason) {
    const open = this.#pm.getAll();
    if (!open.length) return;
    const pos = open[open.length - 1];
    try {
      const tk = await withRetry(() => this.#exchange.fetchTicker(pos.pair));
      const price = this.#validatePrice(tk.last);
      if (!price) return;
      const pnl = this.#calcPnl(pos, price);
      await this.#close(pos, price, 'manual_close', pnl);
    } catch (e) { this.#logger.error('Close last error'); }
  }

  // ===== MAIN TRADING LOOP =====
  async #tick() {
    const now = this.#ts();

    try { await this.#monitor(); this.#reconnect = 0; }
    catch (e) {
      this.#logger.error('Monitor:', e.message);
      this.#reconnect++;
      if (this.#reconnect >= 5) {
        this.#logger.error('Exchange down. Pause 5min.');
        await this.#sleep(300000);
        this.#reconnect = 0;
      }
      return;
    }

    const session = this.#sessionFilter.check();
    if (!session.trade) { return; }

    const cooldownMs = (this.#strategyMode ? this.#strategyMode.getCooldownMinutes() : this.#config.risk.cooldownMinutes) * 60000;
    if (Date.now() - this.#lastTradeTime < cooldownMs) { return; }

    const can = await this.#riskEngine.canTrade();
    if (!can.allowed) { return; }

    for (const pair of this.#config.pairs) {
      try { await this.#scanPair(pair, now); }
      catch (e) { this.#logger.error('Scan ' + pair + ':', e.message); }
    }
  }

  async #scanPair(pair, now) {
    const ohlcv = await withRetry(
      () => this.#exchange.fetchOHLCV(pair, this.#config.timeframes.primary, undefined, 200),
      { maxRetries: 2 }
    );

    if (!ohlcv || ohlcv.length < 50) { return; }

    const mf = await this.#marketFilter.check(ohlcv);
    if (!mf.trade) {
      this.#logger.trade('[' + now + '] ' + pair + ' FILTERED: ' + mf.reason);
      return;
    }

    const signal = await this.#signalEngine.analyze(pair);
    if (signal.side === 'neutral') {
      this.#logger.trade('[' + now + '] ' + pair + ' no signal (' + signal.reason + ')');
      return;
    }

    this.#lifecycle.signal(pair, signal);
    this.#logger.trade('[' + now + '] ' + pair + ' SIGNAL: ' + signal.side + ' | ' + signal.confidence + '%');

    if (this.#deduplicator.isDuplicate(pair, signal.side)) { return; }

    const corr = this.#correlationChecker.check(pair, signal.side);
    if (!corr.allowed) {
      this.#logger.trade('[' + now + '] ' + pair + ' CORRELATION: ' + corr.reason);
      return;
    }

    const ob = await this.#orderbook.analyze(pair);
    const obDecision = this.#orderbook.validateSignal(signal, ob);
    if (obDecision === 'reject') {
      this.#logger.trade('[' + now + '] ' + pair + ' OB REJECTED');
      return;
    }

    let ai = { decision: 'approve', confidence: signal.confidence };
    if (this.#config.ai.enabled) {
      this.#lifecycle.aiValidation(pair, ai);
      ai = await this.#aiValidator.validate(signal);
      if (ai.decision !== 'approve') {
        this.#logger.trade('[' + now + '] ' + pair + ' AI REJECTED: ' + ai.reason);
        return;
      }
      this.#logger.trade('[' + now + '] ' + pair + ' AI APPROVED: ' + ai.confidence + '%');
    }

    await this.#execute(signal, ai, obDecision);
  }

  async #execute(sig, ai, obDecision) {
    try {
      const tk = await withRetry(() => this.#exchange.fetchTicker(sig.pair));
      const entry = this.#validatePrice(tk.last);
      if (!entry) { this.#logger.trade('Skip: invalid price'); return; }

      const atr = sig.indicators?.primary?.indicators?.atr?.value || entry * 0.01;
      const lv = this.#riskEngine.calculateLevels(entry, atr, sig.side);
      const bal = this.#portRepo.getCurrent()?.balance || this.#config.trading.startingBalance;
      const sz = this.#riskEngine.calculatePositionSize(bal, entry, lv.stopLoss);

      if (obDecision === 'caution') { sz.quantity *= 0.5; sz.riskAmount *= 0.5; }
      if (sz.quantity <= 0 || sz.marginRequired > bal) { this.#logger.trade('Skip: sizing'); return; }

      // FIX: Check minimum order size (most exchanges require min $5-10)
      if (sz.quantity * entry < 5) {
        this.#logger.trade('Skip: order too small ($' + (sz.quantity * entry).toFixed(2) + ')');
        return;
      }

      const id = 'T-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
      const pos = {
        id: id.toUpperCase(), pair: sig.pair, side: sig.side, entry_price: entry,
        quantity: sz.quantity, leverage: sz.leverage,
        stop_loss: lv.stopLoss, take_profit: lv.takeProfit,
        status: 'open', ai_confidence: ai.confidence, ai_decision: ai.decision,
        strategy_version: 'v4', open_time: new Date().toISOString()
      };

      this.#posRepo.create(pos);
      this.#pm.track({ ...pos, break_even_price: lv.breakEven, partial_tp_index: 0, remaining_quantity: sz.quantity });
      this.#lastTradeTime = Date.now();
      this.#deduplicator.record(sig.pair, sig.side);
      this.#lifecycle.entry(pos.id, pos);
      this.#eventBus.emit('trade:opened', { ...pos, riskAmount: sz.riskAmount, confidence: ai.confidence });
      this.#logger.trade('OPENED: ' + pos.id + ' | ' + sig.pair + ' ' + sig.side + ' @ ' + entry);
    } catch (e) { this.#logger.error('Execute:', e.message); }
  }

  // ===== POSITION MONITORING =====
  async #monitor() {
    const t = this.#pm.getAll();
    if (!t.length) return;
    for (const pos of t) {
      try {
        const tk = await withRetry(() => this.#exchange.fetchTicker(pos.pair), { maxRetries: 2 });
        const price = this.#validatePrice(tk.last);
        if (!price) { this.#logger.warn('Invalid price for ' + pos.pair); continue; }
        await this.#check(pos, price);
      } catch (e) { this.#logger.error('Check ' + pos.id + ':', e.message); }
    }
  }

  async #check(pos, price) {
    const pnl = this.#calcPnl(pos, price);

    // Stop Loss
    if (pos.side === 'long' ? price <= pos.stop_loss : price >= pos.stop_loss) {
      this.#lifecycle.stopLoss(pos.id, price, pnl);
      await this.#close(pos, price, 'stop_loss', pnl);
      return;
    }

    // Max Hold
    if (Date.now() - new Date(pos.open_time).getTime() > this.#config.risk.maxHoldHours * 3600000) {
      this.#lifecycle.maxHoldExit(pos.id, price, pnl);
      await this.#close(pos, price, 'max_hold', pnl);
      return;
    }

    // Partial TP
    const qty = pos.remaining_quantity || pos.quantity;
    const ptpIndex = pos.partial_tp_index || 0;
    const ptp = this.#riskEngine.shouldPartialTP(price, pos.entry_price, pos.side, ptpIndex);
    if (ptp) {
      const closeQty = qty * (ptp.sizePercent / 100);
      if (closeQty > 0.0001) {
        const closePnl = this.#calcPnlForQty(pos, price, closeQty);
        const fees = closeQty * price * TRADING.FEE_RATE;
        const slip = closeQty * price * TRADING.SLIPPAGE_RATE;
        const net = closePnl - fees - slip;
        const remaining = qty - closeQty;
        const newIdx = ptpIndex + 1;

        this.#pm.update(pos.id, { remaining_quantity: remaining, partial_tp_index: newIdx });
        this.#posRepo.partialClose(pos.id, closeQty, net, fees, slip, remaining, newIdx);
        this.#portRepo.updateBalance(net);
        this.#lifecycle.partialTP(pos.id, newIdx, closeQty, price);
        this.#eventBus.emit('trade:partial_close', { ...pos, closePrice: price, closeQty, pnl: net, level: newIdx, remaining });
        this.#logger.trade('PTP#' + newIdx + ': ' + pos.id + ' | $' + net.toFixed(2));

        if (newIdx === 1) {
          this.#pm.update(pos.id, { stop_loss: pos.entry_price, break_even_applied: true });
          this.#posRepo.update(pos.id, { stop_loss: pos.entry_price, break_even_applied: 1 });
          this.#lifecycle.breakEven(pos.id, price);
        }
        if (remaining <= 0.0001) { await this.#close(pos, price, 'all_tp', 0); return; }
      }
    }

    // Final TP
    if (pos.side === 'long' ? price >= pos.take_profit : price <= pos.take_profit) {
      this.#lifecycle.finalTP(pos.id, price, pnl);
      await this.#close(pos, price, 'take_profit', pnl);
      return;
    }

    // Break Even
    if (!pos.break_even_applied && pos.break_even_price &&
        this.#riskEngine.shouldBreakEven(price, pos.entry_price, pos.break_even_price, pos.side)) {
      this.#pm.update(pos.id, { stop_loss: pos.entry_price, break_even_applied: true });
      this.#posRepo.update(pos.id, { stop_loss: pos.entry_price, break_even_applied: 1 });
      this.#lifecycle.breakEven(pos.id, price);
    }

    // Trailing Stop
    const atr = Math.abs(pos.entry_price - pos.stop_loss) / this.#config.indicators.atrSlMultiplier;
    const ts = this.#riskEngine.getTrailingStop(price, atr, pos.side);
    if (pos.trailing_stop && ((pos.side === 'long' && price <= pos.trailing_stop) || (pos.side === 'short' && price >= pos.trailing_stop))) {
      this.#lifecycle.trailingStop(pos.id, price);
      await this.#close(pos, price, 'trailing_stop', pnl);
      return;
    }
    if (ts && (!pos.trailing_stop || (pos.side === 'long' && ts > pos.trailing_stop) || (pos.side === 'short' && ts < pos.trailing_stop))) {
      this.#pm.update(pos.id, { trailing_stop: ts });
      this.#posRepo.update(pos.id, { trailing_stop: ts });
    }
  }

  async #close(pos, price, reason, pnl) {
    const qty = pos.remaining_quantity || pos.quantity;
    const fees = price * qty * TRADING.FEE_RATE;
    const slip = price * qty * TRADING.SLIPPAGE_RATE;
    const net = pnl - fees - slip;
    const roi = pos.entry_price > 0 && qty > 0 ? (net / (pos.entry_price * qty)) * 100 : 0;
    const hold = Date.now() - new Date(pos.open_time).getTime();

    this.#posRepo.closePosition(pos.id, price, net, roi, fees, slip, reason, hold);
    this.#portRepo.updateBalance(net);
    this.#portRepo.updateWinRate();
    this.#pm.remove(pos.id);
    this.#lifecycle.completed(pos.id);

    if (net <= 0) await this.#riskEngine.recordLoss();

    this.#eventBus.emit('trade:closed', { ...pos, exitPrice: price, pnl: net, roi, reason, fees, slippage: slip, holdDuration: hold });
    this.#logger.trade('CLOSED: ' + pos.id + ' | ' + reason + ' | $' + net.toFixed(2));
  }

  // ===== HELPERS =====
  #calcPnl(pos, price) {
    return (pos.side === 'long' ? price - pos.entry_price : pos.entry_price - price) * (pos.remaining_quantity || pos.quantity);
  }

  #calcPnlForQty(pos, price, qty) {
    return (pos.side === 'long' ? price - pos.entry_price : pos.entry_price - price) * qty;
  }

  // FIX: Validate price is a real number > 0
  #validatePrice(price) {
    if (!price || isNaN(price) || price <= 0) return null;
    return price;
  }

  #ts() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }
  #sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async shutdown() {
    this.#running = false;
    if (this.#loop) { clearInterval(this.#loop); this.#loop = null; }
    this.#logger.info('TradeManager shutdown');
  }

  getOpenPositions() { return this.#pm.getAll(); }
  getPortfolio() { return this.#portRepo.getCurrent(); }
  getLastTradeTime() { return this.#lastTradeTime; }
  get orderbook() { return this.#orderbook; }
  get marketFilter() { return this.#marketFilter; }
  get sessionFilter() { return this.#sessionFilter; }
  get strategyMode() { return this.#strategyMode; }
}
