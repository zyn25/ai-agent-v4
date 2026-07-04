export class PositionSizer {
  #config;
  constructor(config) { this.#config = config; }

  /**
   * Menghitung ukuran posisi berdasarkan risiko per trade.
   * FIX: Mengandung guard Maximum Position Value agar terhindar dari likuidasi paksa.
   */
  calculate(balance, entryPrice, stopLoss) {
    // Guard 1: Cegah NaN jika input invalid
    if (!balance || balance <= 0 || !entryPrice || entryPrice <= 0) {
      throw new Error('Invalid balance or entryPrice for sizing');
    }

    const riskPercent = this.#config.risk.riskPerTrade / 100;
    const riskAmount = balance * riskPercent;
    const stopDistance = Math.abs(entryPrice - stopLoss);

    // Guard 2: Jika SL dan Entry sama persis, reject.
    if (stopDistance === 0) {
      return { quantity: 0, riskAmount: 0, leverage: this.#config.exchange.leverage, reason: 'Zero stop distance' };
    }

    let quantity = riskAmount / stopDistance;
    
    // FIX: Cegah Pos Size Raksasa jika SL terlalu ketat (Anti-Liquidation)
    // Batasi nilai kontrak maksimal 20% dari balance (Konfigurable)
    const maxPositionPercent = this.#config.risk.maxPositionValuePercent || 20;
    const maxPositionValue = balance * (maxPositionPercent / 100);
    let positionValue = quantity * entryPrice;

    if (positionValue > maxPositionValue) {
      // Maksimalkan ke nilai batas aman
      positionValue = maxPositionValue;
      quantity = positionValue / entryPrice;
    }

    const leverage = this.#config.exchange.leverage;
    const marginRequired = positionValue / leverage;

    return {
      quantity: Math.floor(quantity * 10000) / 10000, // Bulatkan ke 4 desimal
      riskAmount: Math.round(riskAmount * 100) / 100,
      riskPercent: this.#config.risk.riskPerTrade,
      positionValue: Math.round(positionValue * 100) / 100,
      marginRequired: Math.round(marginRequired * 100) / 100,
      leverage,
    };
  }

  /**
   * Method untuk menghitung statistik Kelly Criterion saja (tanpa eksekusi size)
   */
  calculateKelly(trades, balance) {
    if (!trades || trades.length < 10) {
      return { winRate: 'N/A', payoffRatio: 'N/A', kelly: 'N/A', kellyHalf: 'N/A', sizePercent: '0.50', confidence: 'low', reason: 'Need min 10 trades' };
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);

    if (wins.length === 0 || losses.length === 0) {
      return { winRate: 'N/A', payoffRatio: 'N/A', kelly: 'N/A', kellyHalf: 'N/A', sizePercent: '0.50', confidence: 'low', reason: 'Need both wins and losses' };
    }

    const winRate = wins.length / trades.length;
    const avgWin = wins.reduce((s, t) => s + t.pnl, 0) / wins.length;
    const avgLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length);
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    const lossRate = 1 - winRate;
    const kellyRaw = payoffRatio > 0 ? (payoffRatio * winRate - lossRate) / payoffRatio : 0;
    const kellyHalf = kellyRaw * 0.5;

    // Batasi Bet Size antara 0.5% (0.005) sampai 5% (0.05)
    const betSize = Math.min(Math.max(kellyHalf, 0.005), 0.05);

    return {
      winRate: (winRate * 100).toFixed(1) + '%',
      payoffRatio: payoffRatio.toFixed(2),
      kelly: (kellyRaw * 100).toFixed(2) + '%',
      kellyHalf: (kellyHalf * 100).toFixed(2) + '%',
      sizePercent: (betSize * 100).toFixed(2),
      confidence: betSize >= 0.02 ? 'high' : betSize >= 0.01 ? 'medium' : 'low',
      reason: kellyRaw <= 0 ? 'Negative edge' : 'OK'
    };
  }

  /**
   * FIX TAMBAHAN: Method yang dipanggil oleh RiskEngine untuk sizing memakai Kelly
   */
  calculateWithKelly(balance, entryPrice, stopLoss, trades) {
    const kellyStats = this.calculateKelly(trades, balance);
    
    // Jika confidence rendah, gunakan risk per trade default dari config
    let effectiveRiskPercent = this.#config.risk.riskPerTrade;

    // Jika confidence Kelly medium/high, override risk per trade dengan Kelly size
    if (kellyStats.confidence !== 'low' && kellyStats.sizePercent !== 'N/A') {
      effectiveRiskPercent = parseFloat(kellyStats.sizePercent);
    }

    // Simulasi perhitungan size sama seperti method calculate, tapi dengan risk kustom
    const riskAmount = balance * (effectiveRiskPercent / 100);
    const stopDistance = Math.abs(entryPrice - stopLoss);

    if (stopDistance === 0) {
      return { quantity: 0, riskAmount: 0, leverage: this.#config.exchange.leverage, reason: 'Zero stop distance' };
    }

    let quantity = riskAmount / stopDistance;
    const maxPositionPercent = this.#config.risk.maxPositionValuePercent || 20;
    const maxPositionValue = balance * (maxPositionPercent / 100);
    let positionValue = quantity * entryPrice;

    if (positionValue > maxPositionValue) {
      positionValue = maxPositionValue;
      quantity = positionValue / entryPrice;
    }

    const leverage = this.#config.exchange.leverage;
    const marginRequired = positionValue / leverage;

    return {
      quantity: Math.floor(quantity * 10000) / 10000,
      riskAmount: Math.round(riskAmount * 100) / 100,
      riskPercent: effectiveRiskPercent,
      positionValue: Math.round(positionValue * 100) / 100,
      marginRequired: Math.round(marginRequired * 100) / 100,
      leverage,
      kellyStats // Sertakan stat Kelly untuk di-log
    };
  }
}
