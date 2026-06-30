export class MessageFormatter {
  formatEntry(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    return (d.side==='long'?'🟢':'🔴')+' <b>ENTRY</b>\n\n'+
      'Trade ID:    <code>'+d.id+'</code>\n'+
      'Pair:        <code>'+d.pair+'</code>\n'+
      'Side:        <code>'+d.side.toUpperCase()+'</code>\n'+
      'Entry:       <code>$'+this.#fp(d.entry_price)+'</code>\n'+
      'Quantity:    <code>'+d.quantity+'</code>\n'+
      'Stop Loss:   <code>$'+this.#fp(d.stop_loss)+'</code>\n'+
      'Take Profit: <code>$'+this.#fp(d.take_profit)+'</code>\n'+
      'Confidence:  <code>'+d.confidence+'%</code>\n'+
      'Risk:        <code>$'+(d.riskAmount||0)+'</code>\n\n'+
      '🕐 '+t;
  }

  formatExit(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    const e = d.pnl >= 0 ? '💰' : '💸';
    const s = d.pnl >= 0 ? '+' : '';
    const hold = d.holdDuration ? this.#duration(d.holdDuration) : 'N/A';
    return e+' <b>CLOSED</b>\n\n'+
      'Trade ID:    <code>'+d.id+'</code>\n'+
      'Pair:        <code>'+d.pair+'</code>\n'+
      'Side:        <code>'+d.side.toUpperCase()+'</code>\n'+
      'Entry:       <code>$'+this.#fp(d.entry_price)+'</code>\n'+
      'Exit:        <code>$'+this.#fp(d.exitPrice)+'</code>\n'+
      'PnL:         <code>'+s+'$'+d.pnl.toFixed(2)+'</code>\n'+
      'ROI:         <code>'+s+d.roi.toFixed(2)+'%</code>\n'+
      'Reason:      <code>'+d.reason+'</code>\n'+
      'Hold Time:   <code>'+hold+'</code>\n'+
      'Fees:        <code>$'+d.fees.toFixed(2)+'</code>\n\n'+
      '🕐 '+t;
  }

  formatPartialClose(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    const e = d.pnl >= 0 ? '💰' : '💸';
    return e+' <b>PARTIAL TP #'+d.level+'</b>\n\n'+
      'Trade ID:  <code>'+d.id+'</code>\n'+
      'Closed:    <code>'+d.closeQty.toFixed(4)+'</code>\n'+
      'Price:     <code>$'+this.#fp(d.closePrice)+'</code>\n'+
      'PnL:       <code>$'+d.pnl.toFixed(2)+'</code>\n'+
      'Remaining: <code>'+d.remaining.toFixed(4)+'</code>\n\n'+
      '🕐 '+t;
  }

  formatDashboard(p, pos, prices) {
    if (!p) return 'No data';
    const t = new Date().toISOString().replace('T',' ').substring(0,19);

    let floatingPnl = 0;
    let posLines = '';
    if (pos && pos.length && prices) {
      for (const position of pos) {
        const cp = prices[position.pair];
        if (!cp) continue;
        const qty = position.remaining_quantity || position.quantity;
        const pnl = position.side === 'long' ? (cp - position.entry_price) * qty : (position.entry_price - cp) * qty;
        const pct = position.entry_price > 0 ? (pnl / (position.entry_price * qty)) * 100 : 0;
        floatingPnl += pnl;
        const emoji = pnl >= 0 ? '🟢' : '🔴';
        const sign = pnl >= 0 ? '+' : '';
        posLines += emoji+' <code>'+position.pair+' '+position.side.toUpperCase()+'</code> <code>'+sign+'$'+pnl.toFixed(2)+' ('+sign+pct.toFixed(2)+'%)</code>\n';
      }
    }

    const totalEquity = (p.balance || 0) + floatingPnl;
    const ddPct = p.peak_balance > 0 ? ((p.peak_balance - totalEquity) / p.peak_balance * 100) : 0;

    return '📊 <b>DASHBOARD</b>\n\n'+
      'Balance:       <code>$'+(p.balance||0).toFixed(2)+'</code>\n'+
      'Equity:        <code>$'+totalEquity.toFixed(2)+'</code>\n'+
      'Floating:      <code>'+(floatingPnl>=0?'+':'')+'$'+floatingPnl.toFixed(2)+'</code>\n'+
      'Realized:      <code>$'+(p.realized_pnl||0).toFixed(2)+'</code>\n'+
      'Daily PnL:     <code>'+((p.daily_pnl||0)>=0?'+':'')+'$'+(p.daily_pnl||0).toFixed(2)+'</code>\n'+
      'Weekly:        <code>'+((p.weekly_pnl||0)>=0?'+':'')+'$'+(p.weekly_pnl||0).toFixed(2)+'</code>\n'+
      'Monthly:       <code>'+((p.monthly_pnl||0)>=0?'+':'')+'$'+(p.monthly_pnl||0).toFixed(2)+'</code>\n'+
      'DD:            <code>'+ddPct.toFixed(2)+'%</code>\n'+
      'Win Rate:      <code>'+(p.win_rate||0).toFixed(1)+'%</code>\n'+
      'Open:          <code>'+(pos?pos.length:0)+'</code>\n\n'+
      (posLines ? '📈 <b>POSITIONS:</b>\n'+posLines+'\n' : '')+
      '🕐 '+t;
  }

  formatOpenPositions(pos, prices) {
    if (!pos || !pos.length) return '📭 No open positions';
    let m = '📋 <b>OPEN POSITIONS</b>\n\n';
    for (const p of pos) {
      const currentPrice = prices ? prices[p.pair] : null;
      const qty = p.remaining_quantity || p.quantity;
      let pnlLine = '';
      const emoji = p.side === 'long' ? '🟢' : '🔴';

      if (currentPrice) {
        const pnl = p.side === 'long' ? (currentPrice - p.entry_price) * qty : (p.entry_price - currentPrice) * qty;
        const pct = p.entry_price > 0 ? (pnl / (p.entry_price * qty)) * 100 : 0;
        const sign = pnl >= 0 ? '+' : '';
        const pnlEmoji = pnl >= 0 ? '💰' : '💸';
        pnlLine = pnlEmoji+' <code>'+sign+'$'+pnl.toFixed(2)+' ('+sign+pct.toFixed(2)+'%)</code>\n';
      }

      m += emoji+' <b>'+p.id+'</b>\n';
      m += '   Pair:      <code>'+p.pair+'</code>\n';
      m += '   Side:      <code>'+p.side.toUpperCase()+'</code>\n';
      m += '   Entry:     <code>$'+this.#fp(p.entry_price)+'</code>\n';
      if (currentPrice) m += '   Current:   <code>$'+this.#fp(currentPrice)+'</code>\n';
      m += '   Qty:       <code>'+qty.toFixed(4)+'/'+p.quantity+'</code>\n';
      m += '   SL:        <code>$'+this.#fp(p.stop_loss)+'</code>\n';
      m += '   TP:        <code>$'+this.#fp(p.take_profit)+'</code>\n';
      m += '   PTP:       <code>'+(p.partial_tp_index||0)+'/3</code>\n';
      if (pnlLine) m += '   '+pnlLine;
      m += '\n';
    }
    return m;
  }

  // Format trade history with better layout
  formatTradeHistory(trades) {
    if (!trades || !trades.length) return '📭 No trades';

    let wins = 0, losses = 0, totalPnl = 0;
    let m = '📋 <b>TRADE HISTORY</b>\n\n';

    for (const t of trades) {
      const emoji = t.status === 'open' ? '🟢' : (t.pnl > 0 ? '💰' : (t.pnl === 0 ? '⚪' : '💸'));
      const sign = t.pnl >= 0 ? '+' : '';
      const holdStr = t.hold_duration ? this.#duration(t.hold_duration) : (t.status === 'open' ? 'Open' : 'N/A');
      const exitReason = t.exit_reason || (t.status === 'open' ? 'open' : 'N/A');
      const status = t.status === 'open' ? 'OPEN' : exitReason.toUpperCase();

      m += emoji+' <b>'+t.id+'</b>\n';
      m += '   Pair:   <code>'+t.pair+'</code>\n';
      m += '   Side:   <code>'+t.side.toUpperCase()+'</code>\n';
      m += '   Entry:  <code>$'+this.#fp(t.entry_price)+'</code>\n';
      if (t.exit_price) m += '   Exit:   <code>$'+this.#fp(t.exit_price)+'</code>\n';
      m += '   PnL:    <code>'+sign+'$'+(t.pnl||0).toFixed(2)+'</code>\n';
      if (t.roi) m += '   ROI:    <code>'+sign+t.roi.toFixed(2)+'%</code>\n';
      m += '   Status: <code>'+status+'</code>\n';
      m += '   Hold:   <code>'+holdStr+'</code>\n\n';

      if (t.status !== 'open') {
        if (t.pnl > 0) wins++;
        else losses++;
        totalPnl += t.pnl || 0;
      }
    }

    const total = wins + losses;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';

    m += '─────────────────────\n';
    m += '📊 <b>SUMMARY</b>\n';
    m += 'Total:    <code>'+total+'</code>\n';
    m += 'Wins:     <code>'+wins+'</code>\n';
    m += 'Losses:   <code>'+losses+'</code>\n';
    m += 'Win Rate: <code>'+winRate+'%</code>\n';
    m += 'PnL:      <code>'+(totalPnl>=0?'+':'')+'$'+totalPnl.toFixed(2)+'</code>\n';

    return m;
  }

  #fp(price) {
    if (!price) return '0.00';
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  }

  #duration(ms) {
    if (!ms || ms <= 0) return '0m';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return h+'h '+m+'m';
    if (m > 0) return m+'m '+s+'s';
    return s+'s';
  }
}
