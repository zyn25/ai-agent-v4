export class MessageFormatter {
  formatEntry(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    return (d.side==='long'?'🟢':'🔴')+' <b>ENTRY</b>\n\nTrade ID: <code>'+d.id+'</code>\nPair: <code>'+d.pair+'</code>\nSide: <code>'+d.side.toUpperCase()+'</code>\nEntry: <code>'+d.entry_price+'</code>\nQty: <code>'+d.quantity+'</code>\nSL: <code>'+d.stop_loss+'</code>\nTP: <code>'+d.take_profit+'</code>\nConfidence: <code>'+d.confidence+'%</code>\nRisk: <code>$'+(d.riskAmount||0)+'</code>\n\n🕐 '+t;
  }

  formatExit(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    const e = d.pnl >= 0 ? '💰' : '💸';
    const s = d.pnl >= 0 ? '+' : '';
    const hold = d.holdDuration ? Math.floor(d.holdDuration/3600000)+'h '+Math.floor((d.holdDuration%3600000)/60000)+'m' : '0m';
    return e+' <b>CLOSED</b>\n\nTrade ID: <code>'+d.id+'</code>\nPair: <code>'+d.pair+'</code>\nEntry: <code>'+d.entry_price+'</code>\nExit: <code>'+d.exitPrice+'</code>\nPnL: <code>'+s+'$'+d.pnl.toFixed(2)+'</code>\nROI: <code>'+s+d.roi.toFixed(2)+'%</code>\nReason: <code>'+d.reason+'</code>\nHold: <code>'+hold+'</code>\nFees: <code>$'+d.fees.toFixed(2)+'</code>\n\n🕐 '+t;
  }

  formatPartialClose(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    const e = d.pnl >= 0 ? '💰' : '💸';
    return e+' <b>PARTIAL TP #'+d.level+'</b>\n\nTrade ID: <code>'+d.id+'</code>\nClosed: <code>'+d.closeQty.toFixed(4)+'</code>\nPrice: <code>'+d.closePrice+'</code>\nPnL: <code>$'+d.pnl.toFixed(2)+'</code>\nRemaining: <code>'+d.remaining.toFixed(4)+'</code>\n\n🕐 '+t;
  }

  formatDashboard(p, pos, prices) {
    if (!p) return 'No data';
    const t = new Date().toISOString().replace('T',' ').substring(0,19);

    let floatingPnl = 0;
    let floatingHtml = '';
    if (pos && pos.length && prices) {
      for (const position of pos) {
        const currentPrice = prices[position.pair];
        if (!currentPrice) continue;
        const qty = position.remaining_quantity || position.quantity;
        const pnl = position.side === 'long'
          ? (currentPrice - position.entry_price) * qty
          : (position.entry_price - currentPrice) * qty;
        const pnlPct = (pnl / (position.entry_price * qty)) * 100;
        floatingPnl += pnl;
        const emoji = pnl >= 0 ? '🟢' : '🔴';
        const sign = pnl >= 0 ? '+' : '';
        floatingHtml += emoji + ' <code>' + position.pair + '</code> <code>' + sign + '$' + pnl.toFixed(2) + ' (' + sign + pnlPct.toFixed(2) + '%)</code>\n';
      }
    }

    const totalEquity = p.balance + floatingPnl;
    const ddPct = p.peak_balance > 0 ? ((p.peak_balance - totalEquity) / p.peak_balance * 100) : 0;

    return '📊 <b>DASHBOARD</b>\n\n' +
      'Balance:    <code>$' + p.balance.toFixed(2) + '</code>\n' +
      'Equity:     <code>$' + totalEquity.toFixed(2) + '</code>\n' +
      'Floating:   <code>' + (floatingPnl >= 0 ? '+' : '') + '$' + floatingPnl.toFixed(2) + '</code>\n' +
      'Realized:   <code>$' + p.realized_pnl.toFixed(2) + '</code>\n' +
      'Daily PnL:  <code>' + (p.daily_pnl >= 0 ? '+' : '') + '$' + p.daily_pnl.toFixed(2) + '</code>\n' +
      'Weekly:     <code>' + (p.weekly_pnl >= 0 ? '+' : '') + '$' + p.weekly_pnl.toFixed(2) + '</code>\n' +
      'DD:         <code>' + ddPct.toFixed(2) + '%</code>\n' +
      'Win Rate:   <code>' + (p.win_rate || 0).toFixed(1) + '%</code>\n' +
      'Open:       <code>' + (pos ? pos.length : 0) + '</code>\n\n' +
      (floatingHtml ? '📈 <b>POSITIONS:</b>\n' + floatingHtml + '\n' : '') +
      '🕐 ' + t;
  }

  formatOpenPositions(pos, prices) {
    if (!pos || !pos.length) return '📭 No open positions';
    let m = '📋 <b>OPEN POSITIONS</b>\n\n';
    for (const p of pos) {
      const currentPrice = prices ? prices[p.pair] : null;
      const qty = p.remaining_quantity || p.quantity;
      let pnlLine = '';
      let emoji = p.side === 'long' ? '🟢' : '🔴';

      if (currentPrice) {
        const pnl = p.side === 'long'
          ? (currentPrice - p.entry_price) * qty
          : (p.entry_price - currentPrice) * qty;
        const pnlPct = (pnl / (p.entry_price * qty)) * 100;
        const sign = pnl >= 0 ? '+' : '';
        const pnlEmoji = pnl >= 0 ? '💰' : '💸';
        pnlLine = pnlEmoji + ' <code>' + sign + '$' + pnl.toFixed(2) + ' (' + sign + pnlPct.toFixed(2) + '%)</code>\n';
      }

      m += emoji + ' <b>' + p.id + '</b>\n';
      m += '   Pair: <code>' + p.pair + '</code>\n';
      m += '   Side: <code>' + p.side.toUpperCase() + '</code>\n';
      m += '   Entry: <code>$' + p.entry_price + '</code>\n';
      if (currentPrice) m += '   Current: <code>$' + currentPrice.toFixed(2) + '</code>\n';
      m += '   Qty: <code>' + qty.toFixed(4) + '/' + p.quantity + '</code>\n';
      m += '   SL: <code>$' + (p.stop_loss || 0).toFixed(2) + '</code>\n';
      m += '   TP: <code>$' + (p.take_profit || 0).toFixed(2) + '</code>\n';
      m += '   PTP: <code>' + (p.partial_tp_index || 0) + '/3</code>\n';
      if (pnlLine) m += '   ' + pnlLine;
      m += '\n';
    }
    return m;
  }
}
