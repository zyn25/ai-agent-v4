export class PaperTrader {
  constructor(config, logger, db) {}
  calculatePnl(entry, exit, qty, side) { return (side === 'long' ? exit - entry : entry - exit) * qty; }
}
