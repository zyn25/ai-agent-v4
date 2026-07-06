/** @module constants */

/** Position statuses */
export const POSITION_STATUS = { OPEN: 'open', CLOSED: 'closed' };

/** Position lifecycle states (master prompt) */
export const POSITION_LIFECYCLE = {
  WAITING: 'waiting',
  SIGNAL: 'signal',
  AI_VALIDATION: 'ai_validation',
  ENTRY: 'entry',
  MONITORING: 'monitoring',
  BREAK_EVEN: 'break_even',
  TRAILING_STOP: 'trailing_stop',
  PARTIAL_TP: 'partial_tp',
  FINAL_TP: 'final_tp',
  MAX_HOLD_EXIT: 'max_hold_exit',
  STOP_LOSS: 'stop_loss',
  EMERGENCY_EXIT: 'emergency_exit',
  COMPLETED: 'completed',
};

/** Trade sides */
export const SIDE = { LONG: 'long', SHORT: 'short' };

/** AI decisions */
export const AI_DECISION = { APPROVE: 'approve', REJECT: 'reject', WAIT: 'wait' };

/** Exit reasons */
export const EXIT_REASON = {
  STOP_LOSS: 'stop_loss',
  TAKE_PROFIT: 'take_profit',
  TRAILING_STOP: 'trailing_stop',
  BREAK_EVEN: 'break_even',
  MAX_HOLD: 'max_hold',
  EMERGENCY: 'emergency',
  MANUAL: 'manual',
};

/** Trading constants (no magic numbers) */
export const TRADING = {
  FEE_RATE: 0.0004,
  SLIPPAGE_RATE: 0.0001,
  MAKER_FEE: 0.0002,
  TAKER_FEE: 0.0004,
  MAX_RETRIES: 3,
  BASE_RETRY_DELAY: 1000,
  MAX_RETRY_DELAY: 30000,
};

/** Timing constants */
export const TIMING = {
  TRADING_LOOP_MS: 60000,
  EQUITY_TRACK_MS: 3600000,
  ALERT_COOLDOWN_MS: 300000,
  TELEGRAM_POLL_INTERVAL: 5000,
  TELEGRAM_RESTART_COOLDOWN: 60000,
  EXCHANGE_TIMEOUT: 30000,
  BACKUP_INTERVAL_MS: 6 * 60 * 60 * 1000,
};

/** Health thresholds */
export const THRESHOLDS = {
  CPU_ALERT: 90,
  RAM_ALERT: 90,
  DISK_ALERT: 90,
  MIN_VOLUME_RATIO: 0.01,
  MIN_ATR_PERCENT: 0.05,
  MIN_CONFIDENCE: 50,
  MAX_CONSECUTIVE_LOSSES: 5,
};

/** Signal scoring weights */
export const SIGNAL_WEIGHTS = {
  EMA: 0.30,
  RSI: 0.20,
  MACD: 0.25,
  VOLUME: 0.15,
  PRICE_ACTION: 0.10,
};

/** Strategy modes */
export const STRATEGY_MODES = {
  aggressive: { name: 'Aggressive', confidenceThreshold: 40, maxOpenPositions: 5, riskPerTrade: 1.0, cooldownMinutes: 15 },
  balanced: { name: 'Balanced', confidenceThreshold: 55, maxOpenPositions: 3, riskPerTrade: 0.75, cooldownMinutes: 30 },
  conservative: { name: 'Conservative', confidenceThreshold: 70, maxOpenPositions: 2, riskPerTrade: 0.5, cooldownMinutes: 60 },
  scalping: { name: 'Scalping', confidenceThreshold: 35, maxOpenPositions: 5, riskPerTrade: 0.5, cooldownMinutes: 5 },
};
