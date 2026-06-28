// Add these lines to #setupCommands():

    // Backtest
    this.#bot.onText(/\/backtest/, async () => {
      await this.#send('⏳ Running backtest...');
      try {
        const { BacktestEngine } = await import('../backtest/BacktestEngine.js');
        const engine = new BacktestEngine(this.#config);
        const result = await engine.run(this.#tradeManager, this.#config.exchange.pair, this.#config.timeframes.primary, 30);
        if (result.error) { await this.#send('❌ ' + result.error); return; }
        let m = '📊 <b>BACKTEST 30D</b>\n\n';
        m += 'Trades: ' + result.totalTrades + '\n';
        m += 'Wins: ' + result.wins + ' | Losses: ' + result.losses + '\n';
        m += 'Win Rate: ' + result.winRate + '%\n';
        m += 'PnL: $' + result.totalPnl + '\n';
        m += 'ROI: ' + result.roi + '%\n';
        m += 'Profit Factor: ' + result.profitFactor + '\n';
        m += 'Max DD: ' + result.maxDrawdown + '%\n';
        m += 'End Balance: $' + result.endBalance;
        await this.#send(m);
      } catch (e) { await this.#send('❌ Backtest error: ' + e.message); }
    });
