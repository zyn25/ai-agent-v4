import { BacktestEngine } from './BacktestEngine.js';

export class Optimizer {
  #baseConfig;

  constructor(config) {
    this.#baseConfig = config;
  }

  async gridSearch(exchange, pair, timeframe, days) {
    const paramGrid = {
      emaFast: [20, 30, 50],
      emaSlow: [100, 150, 200],
      atrSlMultiplier: [1.5, 2.0, 2.5, 3.0],
      atrTpMultiplier: [2.0, 3.0, 4.0, 5.0],
      confidenceThreshold: [50, 60, 70, 80]
    };

    const results = [];
    const total = paramGrid.emaFast.length * paramGrid.emaSlow.length *
                  paramGrid.atrSlMultiplier.length * paramGrid.atrTpMultiplier.length *
                  paramGrid.confidenceThreshold.length;

    let count = 0;
    console.log('Testing ' + total + ' combinations...');

    for (const ef of paramGrid.emaFast) {
      for (const es of paramGrid.emaSlow) {
        if (ef >= es) continue;
        for (const slm of paramGrid.atrSlMultiplier) {
          for (const tpm of paramGrid.atrTpMultiplier) {
            if (tpm <= slm) continue;
            for (const ct of paramGrid.confidenceThreshold) {
              count++;

              // Clone config by extracting getter values
              const config = this.#cloneConfig();
              config.indicators.emaFast = ef;
              config.indicators.emaSlow = es;
              config.indicators.atrSlMultiplier = slm;
              config.indicators.atrTpMultiplier = tpm;
              config.indicators.confidenceThreshold = ct;

              const engine = new BacktestEngine(config);
              const result = await engine.run(exchange, pair, timeframe, days);

              if (result.error || result.totalTrades < 3) continue;

              const pf = parseFloat(result.profitFactor) || 0;
              const wr = parseFloat(result.winRate) || 0;
              const pnl = parseFloat(result.totalPnl) || 0;
              const dd = parseFloat(result.maxDrawdown) || 0;

              const score = (pf * 30) + (wr * 0.3) + (pnl / 100) - (dd * 0.5);

              results.push({
                params: { emaFast: ef, emaSlow: es, atrSl: slm, atrTp: tpm, confidence: ct },
                score, totalPnl: pnl, winRate: wr, profitFactor: pf,
                maxDrawdown: dd, trades: result.totalTrades,
                endBalance: result.endBalance
              });

              if (count % 10 === 0) {
                console.log('Progress: ' + count + '/' + total);
              }
            }
          }
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 10);
  }

  #cloneConfig() {
    // Extract values from Config getters (private fields can't be serialized)
    const c = this.#baseConfig;
    return {
      exchange: { ...c.exchange },
      trading: { ...c.trading },
      indicators: { ...c.indicators },
      risk: {
        ...c.risk,
        partialTpLevels: [...c.risk.partialTpLevels],
        partialTpSizes: [...c.risk.partialTpSizes]
      },
      timeframes: { ...c.timeframes },
      ai: { ...c.ai },
      telegram: { ...c.telegram },
      logging: { ...c.logging },
      pairs: [...c.pairs]
    };
  }
}
