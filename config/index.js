export class Config {
  #exchange; #trading; #indicators; #risk; #timeframes; #ai; #telegram; #logging; #pairs;
  constructor() {
    this.#exchange = { name: process.env.EXCHANGE_NAME || 'binance', apiKey: process.env.EXCHANGE_API_KEY || '', secret: process.env.EXCHANGE_SECRET || '', password: process.env.EXCHANGE_PASSWORD || '', testnet: process.env.EXCHANGE_TESTNET === 'true', pair: process.env.TRADING_PAIR || 'BTC/USDT:USDT', leverage: parseInt(process.env.LEVERAGE, 10) || 10 };
    this.#trading = { mode: process.env.TRADING_MODE || 'paper', startingBalance: parseFloat(process.env.STARTING_BALANCE) || 10000 };
    this.#indicators = { emaFast: parseInt(process.env.EMA_FAST, 10) || 50, emaSlow: parseInt(process.env.EMA_SLOW, 10) || 200, rsiPeriod: parseInt(process.env.RSI_PERIOD, 10) || 14, rsiOverbought: parseInt(process.env.RSI_OVERBOUGHT, 10) || 70, rsiOversold: parseInt(process.env.RSI_OVERSOLD, 10) || 30, macdFast: parseInt(process.env.MACD_FAST, 10) || 12, macdSlow: parseInt(process.env.MACD_SLOW, 10) || 26, macdSignal: parseInt(process.env.MACD_SIGNAL, 10) || 9, atrPeriod: parseInt(process.env.ATR_PERIOD, 10) || 14, atrSlMultiplier: parseFloat(process.env.ATR_SL_MULTIPLIER) || 2, atrTpMultiplier: parseFloat(process.env.ATR_TP_MULTIPLIER) || 3, confidenceThreshold: parseInt(process.env.SIGNAL_CONFIDENCE_THRESHOLD, 10) || 60 };
    this.#risk = { riskPerTrade: parseFloat(process.env.RISK_PER_TRADE) || 1, maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS) || 3, maxWeeklyLoss: parseFloat(process.env.MAX_WEEKLY_LOSS) || 7, maxDrawdown: parseFloat(process.env.MAX_DRAWDOWN) || 15, maxConsecutiveLosses: parseInt(process.env.MAX_CONSECUTIVE_LOSSES, 10) || 5, maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS, 10) || 3, cooldownMinutes: parseInt(process.env.COOLDOWN_MINUTES, 10) || 30, maxHoldHours: parseInt(process.env.MAX_HOLD_HOURS, 10) || 24, breakEvenTrigger: parseFloat(process.env.BREAK_EVEN_TRIGGER) || 1.0, trailingStopATR: parseFloat(process.env.TRAILING_STOP_ATR) || 2.0, partialTpLevels: (process.env.PARTIAL_TP_LEVELS || '1.5,2.5,4.0').split(',').map(Number), partialTpSizes: (process.env.PARTIAL_TP_SIZES || '30,30,40').split(',').map(Number) };
    this.#timeframes = { primary: process.env.TIMEFRAME_PRIMARY || '15m', secondary: process.env.TIMEFRAME_SECONDARY || '1h', tertiary: process.env.TIMEFRAME_TERTIARY || '4h' };
    this.#ai = { enabled: process.env.AI_ENABLED !== 'false', apiKey: process.env.OPENROUTER_API_KEY || '', model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o', confidenceThreshold: parseInt(process.env.AI_CONFIDENCE_THRESHOLD, 10) || 70, maxTokens: parseInt(process.env.AI_MAX_TOKENS, 10) || 500, temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.1 };
    this.#telegram = { enabled: process.env.TELEGRAM_ENABLED !== 'false', botToken: process.env.TELEGRAM_BOT_TOKEN || '', chatId: process.env.TELEGRAM_CHAT_ID || '' };
    this.#logging = { level: process.env.LOG_LEVEL || 'info', maxSizeMB: parseInt(process.env.LOG_MAX_SIZE_MB, 10) || 50, maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 10 };
    this.#pairs = (process.env.TRADING_PAIRS || process.env.TRADING_PAIR || 'BTC/USDT:USDT').split(',').map(s => s.trim());
  }
  get exchange() { return this.#exchange; }
  get trading() { return this.#trading; }
  get indicators() { return this.#indicators; }
  get risk() { return this.#risk; }
  get timeframes() { return this.#timeframes; }
  get ai() { return this.#ai; }
  get telegram() { return this.#telegram; }
  get logging() { return this.#logging; }
  get pairs() { return this.#pairs; }
}
