/**
 * Position lifecycle logger.
 * Required by master prompt: "Every transition must be logged"
 */
export class LifecycleLogger {
  #db; #logger;
  constructor(database, logger) { this.#db = database; this.#logger = logger; }

  /**
   * Log a lifecycle transition
   * @param {string} positionId - Trade ID
   * @param {string} from - Previous state
   * @param {string} to - New state
   * @param {object} details - Additional details
   */
  log(positionId, from, to, details = null) {
    const message = positionId + ': ' + from + ' → ' + to;
    this.#logger.trade('[LIFECYCLE] ' + message);

    try {
      this.#db.prepare(
        "INSERT INTO trade_logs (position_id, level, message, details) VALUES (?, ?, ?, ?)"
      ).run(positionId, 'info', message, details ? JSON.stringify(details) : null);
    } catch (e) {
      this.#logger.error('Lifecycle log error:', e.message);
    }
  }

  // Lifecycle states as per master prompt:
  // Waiting → Signal → AI Validation → Entry → Monitoring
  // → Break Even → Trailing Stop → Partial TP → Final TP
  // → Max Hold Exit → Stop Loss → Emergency Exit → Completed

  waiting(positionId) { this.log(positionId, 'init', 'waiting'); }
  signal(positionId, signal) { this.log(positionId, 'waiting', 'signal', { side: signal.side, confidence: signal.confidence }); }
  aiValidation(positionId, ai) { this.log(positionId, 'signal', 'ai_validation', { decision: ai.decision, confidence: ai.confidence }); }
  entry(positionId, pos) { this.log(positionId, 'ai_validation', 'entry', { price: pos.entry_price, qty: pos.quantity }); }
  monitoring(positionId) { this.log(positionId, 'entry', 'monitoring'); }
  breakEven(positionId, price) { this.log(positionId, 'monitoring', 'break_even', { price }); }
  trailingStop(positionId, price) { this.log(positionId, 'monitoring', 'trailing_stop', { price }); }
  partialTP(positionId, level, qty, price) { this.log(positionId, 'monitoring', 'partial_tp_' + level, { qty, price }); }
  finalTP(positionId, price, pnl) { this.log(positionId, 'monitoring', 'final_tp', { price, pnl }); }
  maxHoldExit(positionId, price, pnl) { this.log(positionId, 'monitoring', 'max_hold_exit', { price, pnl }); }
  stopLoss(positionId, price, pnl) { this.log(positionId, 'monitoring', 'stop_loss', { price, pnl }); }
  emergencyExit(positionId, reason) { this.log(positionId, 'monitoring', 'emergency_exit', { reason }); }
  completed(positionId) { this.log(positionId, 'any', 'completed'); }
}
