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
  formatDashboard(p, pos) {
    if (!p) return 'No data';
    const t = new Date().toISOString().replace('T',' ').substring(0,19);
    return '📊 <b>DASHBOARD</b>\n\nBalance: <code>$'+p.balance.toFixed(2)+'</code>\nEquity: <code>$'+p.equity.toFixed(2)+'</code>\nDaily PnL: <code>'+(p.daily_pnl>=0?'+':'')+'$'+p.daily_pnl.toFixed(2)+'</code>\nWeekly: <code>'+(p.weekly_pnl>=0?'+':'')+'$'+p.weekly_pnl.toFixed(2)+'</code>\nWin Rate: <code>'+(p.win_rate||0).toFixed(1)+'%</code>\nOpen: <code>'+pos.length+'</code>\n\n🕐 '+t;
  }
  formatOpenPositions(pos) {
    if (!pos.length) return '📭 No open positions';
    let m = '📋 <b>OPEN POSITIONS</b>\n\n';
    pos.forEach(p => {
      m += (p.side==='long'?'🟢':'🔴')+' <code>'+p.id+'</code>\n';
      m += '   '+p.pair+' | '+p.side.toUpperCase()+'\n';
      m += '   Entry: '+p.entry_price+'\n';
      m += '   Qty: '+(p.remaining_quantity||p.quantity)+'/'+p.quantity+'\n';
      m += '   PTP: '+(p.partial_tp_index||0)+'/'+3+'\n\n';
    });
    return m;
  }
}
