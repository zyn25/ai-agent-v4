export class MessageFormatter {
  formatEntry(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    return `${d.side==='long'?'🟢':'🔴'} <b>ENTRY</b>\n\n<b>Trade ID:</b> <code>${d.id}</code>\n<b>Pair:</b> <code>${d.pair}</code>\n<b>Side:</b> <code>${d.side.toUpperCase()}</code>\n<b>Entry:</b> <code>${d.entry_price}</code>\n<b>Qty:</b> <code>${d.quantity}</code>\n<b>SL:</b> <code>${d.stop_loss}</code>\n<b>TP:</b> <code>${d.take_profit}</code>\n<b>Confidence:</b> <code>${d.confidence}%</code>\n\n🕐 ${t}`;
  }
  formatExit(d) {
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    const e = d.pnl >= 0 ? '💰' : '💸';
    return `${e} <b>CLOSED</b>\n\n<b>Trade ID:</b> <code>${d.id}</code>\n<b>PnL:</b> <code>${d.pnl>=0?'+':''}$${d.pnl.toFixed(2)}</code>\n<b>ROI:</b> <code>${d.roi.toFixed(2)}%</code>\n<b>Reason:</b> <code>${d.reason}</code>\n\n🕐 ${t}`;
  }
  formatDashboard(p, pos) {
    if (!p) return 'No data';
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    return `📊 <b>DASHBOARD</b>\n\n<b>Balance:</b> <code>$${p.balance.toFixed(2)}</code>\n<b>Daily PnL:</b> <code>${p.daily_pnl>=0?'+':''}$${p.daily_pnl.toFixed(2)}</code>\n<b>Open:</b> <code>${pos.length}</code>\n\n🕐 ${t}`;
  }
  formatOpenPositions(pos) {
    if (!pos.length) return '📭 No open positions';
    let m = '📋 <b>OPEN</b>\n\n';
    pos.forEach(p => { m += `${p.side==='long'?'🟢':'🔴'} <code>${p.id}</code> ${p.pair}\n`; });
    return m;
  }
}
