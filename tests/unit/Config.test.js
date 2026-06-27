import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Config } from '../../config/index.js';
describe('Config', () => {
  const orig = { ...process.env };
  beforeEach(() => {
    process.env.EXCHANGE_NAME = 'binance';
    process.env.TRADING_PAIR = 'BTC/USDT:USDT';
    process.env.TRADING_MODE = 'paper';
    process.env.STARTING_BALANCE = '10000';
    process.env.LEVERAGE = '10';
    process.env.RISK_PER_TRADE = '1';
  });
  afterEach(() => { process.env = { ...orig }; });
  it('exchange config', () => { const c = new Config(); assert.equal(c.exchange.name, 'binance'); assert.equal(c.exchange.pair, 'BTC/USDT:USDT'); });
  it('trading config', () => { const c = new Config(); assert.equal(c.trading.mode, 'paper'); assert.equal(c.trading.startingBalance, 10000); });
  it('indicator defaults', () => { const c = new Config(); assert.equal(c.indicators.emaFast, 50); assert.equal(c.indicators.rsiPeriod, 14); });
  it('risk defaults', () => { const c = new Config(); assert.equal(c.risk.riskPerTrade, 1); assert.equal(c.risk.maxDailyLoss, 3); });
  it('custom env', () => { process.env.EMA_FAST = '21'; assert.equal(new Config().indicators.emaFast, 21); });
});
