import { PositionManager } from './PositionManager.js';
import { PositionRepository } from '../database/repositories/PositionRepository.js';
import { PortfolioRepository } from '../database/repositories/PortfolioRepository.js';
import { OrderbookAnalyzer } from '../strategy/OrderbookAnalyzer.js';
import { MarketFilter } from '../strategy/MarketFilter.js';
import { MarketStructure } from '../strategy/MarketStructure.js';
import { SessionFilter } from '../strategy/SessionFilter.js';
import { CorrelationChecker } from '../strategy/CorrelationChecker.js';
import { OrderDeduplicator } from './OrderDeduplicator.js';
import { LifecycleLogger } from './LifecycleLogger.js';
import { EntryConfirmation } from '../strategy/EntryConfirmation.js';
import { withRetry } from '../utils/retry.js';
import { TRADING, TIMING } from '../utils/constants.js';
import { EventEmitter } from 'events';
import { DynamicLevels } from '../risk/DynamicLevels.js';
import { FundingRateCheck } from '../strategy/FundingRateCheck.js';
import { SmartCooldown } from './SmartCooldown.js';
import { PairRotation } from '../strategy/PairRotation.js';
import { PullbackFilter } from '../strategy/PullbackFilter.js';
import { CandlePatterns } from '../strategy/CandlePatterns.js';
import { StreakHandler } from '../risk/StreakHandler.js';

export class TradeManager extends EventEmitter {
  #config; #logger; #db; #exchange; #signalEngine; #riskEngine; #aiValidator; #eventBus;
  #pm; #posRepo; #portRepo; #orderbook; #marketFilter; #marketStructure; #sessionFilter;
  #correlationChecker; #deduplicator; #strategyMode; #lifecycle; #entryConfirm;
  #dynamicLevels; #fundingRate; #smartCooldown; #pairRotation; #pullbackFilter;
  #candlePatterns; #streakHandler;
  #running = false; #loop = null; #reconnect = 0; #pairErrors = new Map();
  #paused = false; #pauseReason = ''; #lastTradeTime = 0; #lastSessionBlock = '';

  constructor(c, l, db, ex, se, re, av, eb, sm) {
    super();
    this.#config = c; this.#logger = l; this.#db = db; this.#exchange = ex;
    this.#signalEngine = se; this.#riskEngine = re; this.#aiValidator = av; this.#eventBus = eb;
    this.#strategyMode = sm;
    this.#pm = new PositionManager(db);
    this.#posRepo = new PositionRepository(db);
    this.#portRepo = new PortfolioRepository(db);
    this.#orderbook = new OrderbookAnalyzer(ex, l);
    this.#marketFilter = new MarketFilter(c, l);
    this.#marketStructure = new MarketStructure(c, l);
    this.#sessionFilter = new SessionFilter(c, l);
    this.#correlationChecker = new CorrelationChecker(db, l);
    this.#deduplicator = new OrderDeduplicator(c);
    this.#lifecycle = new LifecycleLogger(db, l);
    this.#entryConfirm = new EntryConfirmation(l);
    this.#dynamicLevels = new DynamicLevels(c, l);
    this.#fundingRate = new FundingRateCheck(ex, l);
    this.#smartCooldown = new SmartCooldown(c, l, db);
    this.#pairRotation = new PairRotation(c, l, db);
    this.#pullbackFilter = new PullbackFilter(l);
    this.#candlePatterns = new CandlePatterns(l);
    this.#streakHandler = new StreakHandler(db, l, c);
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
    let ticking = false;
    this.#loop = setInterval(async () => {
      if (!this.#running || this.#paused || ticking) return;
      ticking = true;
      try { await this.#tick(); }
      catch (e) { this.#logger.error('Loop:', e.message); }
      finally { ticking = false; }
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
        this.#db.prepare('INSERT INTO equity_curve (balance, equity, drawdown, drawdown_pct, peak_balance, open_positions) VALUES (?, ?, ?, ?, ?, ?)').run(p.balance, equity, peak - equity, dd, peak, open.length);
        this.#db.prepare("DELETE FROM equity_curve WHERE created_at < datetime('now', '-7 days')").run();
      } catch (e) { this.#logger.error('Equity tracking:', e.message); }
    }, TIMING.EQUITY_TRACK_MS);
  }

  pause(reason) { this.#paused = true; this.#pauseReason = reason || 'Manual'; this.#logger.warn('PAUSED: ' + this.#pauseReason); this.#eventBus.emit('trade:paused', { reason: this.#pauseReason }); }
  resume() { this.#paused = false; this.#pauseReason = ''; this.#logger.info('RESUMED'); this.#eventBus.emit('trade:resumed', {}); }
  get isPaused() { return this.#paused; }
  get pauseReason() { return this.#pauseReason; }

  async closeAll(reason) {
    const open = this.#pm.getAll();
    this.#db.exec('BEGIN TRANSACTION');
    try {
      for (const pos of open) {
        try {
          const tk = await withRetry(() => this.#exchange.fetchTicker(pos.pair));
          const price = this.#validatePrice(tk.last);
          if (!price) { this.#logger.error('Invalid ticker for ' + pos.pair + ' during closeAll'); continue; }
          await this.#close(pos, price, 'emergency_' + reason, this.#calcPnl(pos, price));
        } catch (e) { this.#logger.error('Close error ' + pos.id); }
      }
      this.#db.exec('COMMIT');
    } catch (e) {
      this.#db.exec('ROLLBACK');
      this.#logger.error('CloseAll transaction failed:', e.message);
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
      await this.#close(pos, price, 'manual_close', this.#calcPnl(pos, price));
    } catch (e) { this.#logger.error('Close last error'); }
  }

  async #tick() {
    const now = this.#ts();
    try { await this.#monitor(); }
    catch (e) { this.#logger.error('Monitor:', e.message); }

    const session = this.#sessionFilter.check();
    if (!session.trade) {
      const blockKey = session.reason;
      if (this.#lastSessionBlock !== blockKey) {
        this.#lastSessionBlock = blockKey;
        this.#eventBus.emit('session:blocked', { reason: session.reason, session: session.session });
      }
      return;
    }
    if (this.#lastSessionBlock) { this.#lastSessionBlock = ''; this.#eventBus.emit('session:resumed', { session: session.session }); }

    const cooldownMs = this.#smartCooldown.getCooldown();
    if (Date.now() - this.#lastTradeTime < cooldownMs) return;

    const can = await this.#riskEngine.canTrade();
    if (!can.allowed) return;

    for (const pair of this.#config.pairs) {
      try { await this.#scanPair(pair, now); }
      catch (e) { this.#logger.error('Scan ' + pair + ':', e.message); }
    }
  }

  async #scanPair(pair, now) {
    // Pair rotation: skip underperforming pairs
    if (this.#pairRotation.shouldSkip(pair)) return;

    const ohlcv = await withRetry(
      () => this.#exchange.fetchOHLCV(pair, this.#config.timeframes.primary, undefined, 200),
      { maxRetries: 2 }
    );
    if (!ohlcv || ohlcv.length < 50) return;

    const mf = await this.#marketFilter.check(ohlcv);
    if (!mf.trade) { this.#logger.trade('[' + now + '] ' + pair + ' FILTERED: ' + mf.reason); return; }

    const signal = await this.#signalEngine.analyze(pair);
    if (signal.side === 'neutral') { this.#logger.trade('[' + now + '] ' + pair + ' no signal (' + signal.reason + ')'); return; }

    this.#lifecycle.signal(pair, signal);
    this.#logger.trade('[' + now + '] ' + pair + ' SIGNAL: ' + signal.side + ' | ' + signal.confidence + '%');

    if (this.#deduplicator.isDuplicate(pair, signal.side)) return;

    const corr = this.#correlationChecker.check(pair, signal.side);
    if (!corr.allowed) { this.#logger.trade('[' + now + '] ' + pair + ' CORRELATION: ' + corr.reason); return; }

    // Funding rate check
    const funding = await this.#fundingRate.check(pair, signal.side);
    if (!funding.allowed) { this.#logger.trade('[' + now + '] ' + pair + ' FUNDING: ' + funding.reason); return; }
    if (funding.caution) { signal.confidence = Math.max(signal.confidence - 5, 0); }

    // Session score modulation
    const sessionScore = this.#sessionFilter.getSessionScore ? this.#sessionFilter.getSessionScore() : 100;
    if (sessionScore < 50) { signal.confidence = Math.round(signal.confidence * 0.85); }

    // Pullback filter
    const closes = ohlcv.map(c => c[4]);
    const opens = ohlcv.map(c => c[1]);
    const highs = ohlcv.map(c => c[2]);
    const lows = ohlcv.map(c => c[3]);
    const price = closes[closes.length - 1];

    const pullback = this.#pullbackFilter.check(closes, highs, lows, signal.side);
    if (!pullback.valid) { this.#logger.trade('[' + now + '] ' + pair + ' PULLBACK: ' + pullback.reason); return; }

    // Candle pattern confirmation (bonus confidence)
    const candleConfirm = this.#candlePatterns.confirm(signal.side, closes, highs, lows, opens);
    if (candleConfirm.confirmed) {
      signal.confidence = Math.min(signal.confidence + 5, 100);
      this.#logger.trade('[' + now + '] ' + pair + ' CANDLE: ' + candleConfirm.pattern + ' (+5%)');
    }

    // Entry confirmation check
    const entryConfirm = this.#entryConfirm.check(closes, opens, signal.side);
    if (!entryConfirm.confirmed) {
      this.#logger.trade('[' + now + '] ' + pair + ' ENTRY REJECTED: ' + entryConfirm.reason);
      return;
    }

    // Support/Resistance check
    const srValid = this.#marketStructure.validateEntry(signal.side, price, highs, lows, closes);
    if (!srValid) {
      this.#logger.trade('[' + now + '] ' + pair + ' S/R BLOCKED');
      return;
    }

    const ob = await this.#orderbook.analyze(pair);
    const obDecision = this.#orderbook.validateSignal(signal, ob);
    if (obDecision === 'reject') { this.#logger.trade('[' + now + '] ' + pair + ' OB REJECTED'); return; }

    let ai = { decision: 'approve', confidence: signal.confidence };
    if (this.#config.ai.enabled) {
      ai = await this.#aiValidator.validate(signal, this.#strategyMode ? this.#strategyMode.getConfidenceThreshold() : undefined);
      this.#eventBus.emit('ai:validated', { pair, side: signal.side, decision: ai.decision, confidence: ai.confidence, reason: ai.reason, latency: 0, fallback: ai.fallback || false });
      if (ai.decision !== 'approve') { this.#logger.trade('[' + now + '] ' + pair + ' AI REJECTED: ' + ai.reason); return; }
      this.#logger.trade('[' + now + '] ' + pair + ' AI APPROVED: ' + ai.confidence + '%');
    }

    await this.#execute(signal, ai, obDecision, ohlcv);
  }

  async #execute(sig, ai, obDecision, ohlcv) {
    try {
      const tk = await withRetry(() => this.#exchange.fetchTicker(sig.pair));
      const entry = this.#validatePrice(tk.last);
      if (!entry) { this.#logger.trade('Invalid ticker for ' + sig.pair); return; }

      // Streak handler: check if we should pause
      const streakPause = this.#streakHandler.shouldPause();
      if (streakPause.pause) { this.#logger.trade('STREAK PAUSE: ' + streakPause.reason); return; }

      const atr = sig.indicators?.primary?.indicators?.atr?.value || entry * 0.01;

      // Dynamic levels: adaptive SL/TP based on volatility
      const highs = ohlcv.map(c => c[2]);
      const lows = ohlcv.map(c => c[3]);
      const closes = ohlcv.map(c => c[4]);
      const trendStrength = { strength: sig.confidence, grade: sig.confidence >= 70 ? 'A' : sig.confidence >= 50 ? 'B' : 'C' };
      const dynLevels = this.#dynamicLevels.calculate(entry, sig.side, highs, lows, closes, trendStrength);

      // Use dynamic levels if available, fallback to static
      const lv = dynLevels.mode !== 'fallback'
        ? { stopLoss: dynLevels.stopLoss, takeProfit: dynLevels.takeProfit, breakEven: dynLevels.breakEven }
        : this.#riskEngine.calculateLevels(entry, atr, sig.side);

      const bal = this.#portRepo.getCurrent()?.balance || this.#config.trading.startingBalance;

      // Kelly criterion sizing
      const sz = this.#riskEngine.calculatePositionSizeWithKelly(bal, entry, lv.stopLoss);

      // Streak adjustment
      const streakAdj = this.#streakHandler.adjustSize(sz.quantity);
      sz.quantity = streakAdj.size;

      if (obDecision === 'caution') { sz.quantity *= 0.5; sz.riskAmount *= 0.5; }
      if (sz.quantity <= 0 || sz.marginRequired > bal) return;
      if (sz.quantity * entry < 5) return;

      const id = 'T-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
      const pos = {
        id: id.toUpperCase(), pair: sig.pair, side: sig.side, entry_price: entry,
        quantity: sz.quantity, leverage: sz.leverage,
        stop_loss: lv.stopLoss, take_profit: lv.takeProfit,
        status: 'open', ai_confidence: ai.confidence, ai_decision: ai.decision,
        strategy_version: 'v4', open_time: new Date().toISOString(),
        atr_at_entry: atr
      };

      this.#posRepo.create(pos);
      this.#pm.track({ ...pos, break_even_price: lv.breakEven, partial_tp_index: 0, remaining_quantity: sz.quantity });
      this.#lastTradeTime = Date.now();
      this.#deduplicator.record(sig.pair, sig.side);
      this.#lifecycle.entry(pos.id, pos);
      this.#eventBus.emit('trade:opened', { ...pos, riskAmount: sz.riskAmount, confidence: ai.confidence, kellyStats: sz.kellyStats });
      this.#logger.trade('OPENED: ' + pos.id + ' | ' + sig.pair + ' ' + sig.side + ' @ ' + entry + ' | Dynamic:' + dynLevels.mode);
    } catch (e) { this.#logger.error('Execute:', e.message); }
  }

  async #monitor() {
    const t = this.#pm.getAll();
    if (!t.length) return;
    let globalErrors = 0;
    for (const pos of t) {
      try {
        const tk = await withRetry(() => this.#exchange.fetchTicker(pos.pair), { maxRetries: 2 });
        const price = this.#validatePrice(tk.last);
        if (!price) { this.#logger.trade('Invalid ticker for ' + pos.pair); continue; }
        await this.#check(pos, price);
      } catch (e) {
        globalErrors++;
        const pe = this.#pairErrors.get(pos.pair) || 0;
        this.#pairErrors.set(pos.pair, pe + 1);
        this.#logger.error('Check ' + pos.id + ':', e.message);
      }
    }
    if (globalErrors >= t.length && globalErrors >= 3) {
      this.#reconnect++;
      if (this.#reconnect >= 5) { await this.#sleep(300000); this.#reconnect = 0; }
    } else {
      this.#reconnect = 0;
    }
  }

  async #check(pos, price) {
    const qty = pos.remaining_quantity || pos.quantity;
    const pnl = this.#calcPnl(pos, price);

    if (pos.side === 'long' ? price <= pos.stop_loss : price >= pos.stop_loss) {
      this.#lifecycle.stopLoss(pos.id, price, pnl);
      await this.#close(pos, price, 'stop_loss', pnl); return;
    }

    if (Date.now() - new Date(pos.open_time).getTime() > this.#config.risk.maxHoldHours * 3600000) {
      this.#lifecycle.maxHoldExit(pos.id, price, pnl);
      await this.#close(pos, price, 'max_hold', pnl); return;
    }

    // Partial TP
    const ptpIndex = pos.partial_tp_index || 0;
    const ptp = this.#riskEngine.shouldPartialTP(price, pos.entry_price, pos.side, ptpIndex);
    if (ptp) {
      const closeQty = Math.min(qty * (ptp.sizePercent / 100), qty);
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

        if (newIdx >= 1) {
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
      await this.#close(pos, price, 'take_profit', pnl); return;
    }

    // Break Even
    if (!pos.break_even_applied && pos.break_even_price && this.#riskEngine.shouldBreakEven(price, pos.entry_price, pos.break_even_price, pos.side)) {
      this.#pm.update(pos.id, { stop_loss: pos.entry_price, break_even_applied: true });
      this.#posRepo.update(pos.id, { stop_loss: pos.entry_price, break_even_applied: 1 });
      this.#lifecycle.breakEven(pos.id, price);
    }

    // Trailing Stop - only after 0.5R profit
    const atr = pos.atr_at_entry || Math.abs(pos.entry_price - pos.stop_loss) / this.#config.indicators.atrSlMultiplier || pos.entry_price * 0.01;
    const profitDistance = pos.side === 'long' ? price - pos.entry_price : pos.entry_price - price;
    const profitInR = atr > 0 ? profitDistance / atr : 0;

    if (profitInR >= 0.5) {
      const ts = this.#riskEngine.getTrailingStop(price, atr, pos.side);
      const currentPos = this.#pm.get(pos.id);
      if (!currentPos) return;
      if (currentPos.trailing_stop) {
        if ((pos.side === 'long' && price <= currentPos.trailing_stop) || (pos.side === 'short' && price >= currentPos.trailing_stop)) {
          this.#lifecycle.trailingStop(pos.id, price);
          await this.#close(pos, price, 'trailing_stop', pnl); return;
        }
      }
      if (ts && (!currentPos.trailing_stop || (pos.side === 'long' && ts > currentPos.trailing_stop) || (pos.side === 'short' && ts < currentPos.trailing_stop))) {
        this.#pm.update(pos.id, { trailing_stop: ts });
        this.#posRepo.update(pos.id, { trailing_stop: ts });
      }
    }
  }

  async #close(pos, price, reason, pnl) {
    const qty = pos.remaining_quantity || pos.quantity;
    const fees = price * qty * TRADING.FEE_RATE;
    const slip = price * qty * TRADING.SLIPPAGE_RATE;
    const net = pnl - fees - slip;
    const roi = pos.entry_price > 0 && qty > 0 ? ((net / (pos.entry_price * qty)) * 100 * (pos.leverage || 1)) : 0;
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

  #calcPnl(pos, price) { return (pos.side === 'long' ? price - pos.entry_price : pos.entry_price - price) * (pos.remaining_quantity || pos.quantity); }
  #calcPnlForQty(pos, price, qty) { return (pos.side === 'long' ? price - pos.entry_price : pos.entry_price - price) * qty; }
  #validatePrice(price) { if (!price || isNaN(price) || price <= 0) return null; return price; }
  #ts() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }
  #sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async shutdown() { this.#running = false; if (this.#loop) { clearInterval(this.#loop); this.#loop = null; } this.#logger.info('TradeManager shutdown'); }
  getOpenPositions() { return this.#pm.getAll(); }
  getPortfolio() { return this.#portRepo.getCurrent(); }
  getLastTradeTime() { return this.#lastTradeTime; }
  get orderbook() { return this.#orderbook; }
  get marketFilter() { return this.#marketFilter; }
  get sessionFilter() { return this.#sessionFilter; }
  get strategyMode() { return this.#strategyMode; }
}
