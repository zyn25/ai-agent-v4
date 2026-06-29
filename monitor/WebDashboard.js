import { createServer } from 'http';

/**
 * Simple web dashboard.
 * Monitor bot status from browser.
 * No external dependencies required.
 */
export class WebDashboard {
  #config; #logger; #db; #tradeManager; #server; #port;

  constructor(config, logger, database, tradeManager) {
    this.#config = config;
    this.#logger = logger;
    this.#db = database;
    this.#tradeManager = tradeManager;
    this.#port = parseInt(process.env.DASHBOARD_PORT, 10) ||8888;
  }

  start() {
    this.#server = createServer((req, res) => {
      try {
        if (req.url === '/' || req.url === '/dashboard') {
          this.#serveDashboard(res);
        } else if (req.url === '/api/status') {
          this.#serveAPI(res);
        } else if (req.url === '/health') {
          this.#serveHealth(res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      } catch (e) {
        res.writeHead(500);
        res.end('Error: ' + e.message);
      }
    });

    this.#server.listen(this.#port, '0.0.0.0', () => {
      this.#logger.info('Web dashboard: http://0.0.0.0:' + this.#port);
    });
  }

  #serveDashboard(res) {
    const portfolio = this.#db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get();
    const positions = this.#db.prepare("SELECT * FROM positions WHERE status='open'").all();
    const stats = this.#db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins, COALESCE(SUM(pnl),0) as total_pnl FROM positions WHERE status='closed'").get();
    const recentTrades = this.#db.prepare("SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 10").all();

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Agent V4</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: #00d4aa; font-size: 24px; }
    .header p { color: #888; margin-top: 5px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .card { background: #1a1a1a; border-radius: 12px; padding: 20px; border: 1px solid #2a2a2a; }
    .card h3 { color: #888; font-size: 12px; text-transform: uppercase; margin-bottom: 8px; }
    .card .value { font-size: 24px; font-weight: bold; }
    .card .value.green { color: #00d4aa; }
    .card .value.red { color: #ff4757; }
    .card .value.blue { color: #3498db; }
    .section { background: #1a1a1a; border-radius: 12px; padding: 20px; border: 1px solid #2a2a2a; margin-bottom: 20px; }
    .section h2 { color: #00d4aa; font-size: 16px; margin-bottom: 15px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: #888; font-size: 12px; padding: 8px; border-bottom: 1px solid #2a2a2a; }
    td { padding: 8px; font-size: 14px; border-bottom: 1px solid #1a1a1a; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    .badge-green { background: #00d4aa22; color: #00d4aa; }
    .badge-red { background: #ff475722; color: #ff4757; }
    .badge-blue { background: #3498db22; color: #3498db; }
    .status { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
    .status.online { background: #00d4aa; }
    .status.offline { background: #ff4757; }
    .refresh { color: #888; font-size: 12px; text-align: center; margin-top: 20px; }
  </style>
  <script>setTimeout(() => location.reload(), 30000);</script>
</head>
<body>
  <div class="header">
    <h1>🤖 AI Agent V4</h1>
    <p><span class="status online"></span>Online | ${new Date().toISOString().replace('T', ' ').substring(0, 19)}</p>
  </div>

  <div class="grid">
    <div class="card">
      <h3>Balance</h3>
      <div class="value green">$${(portfolio?.balance || 0).toFixed(2)}</div>
    </div>
    <div class="card">
      <h3>Equity</h3>
      <div class="value blue">$${(portfolio?.equity || 0).toFixed(2)}</div>
    </div>
    <div class="card">
      <h3>Daily PnL</h3>
      <div class="value ${(portfolio?.daily_pnl || 0) >= 0 ? 'green' : 'red'}">$${(portfolio?.daily_pnl || 0).toFixed(2)}</div>
    </div>
    <div class="card">
      <h3>Open Positions</h3>
      <div class="value blue">${positions.length}</div>
    </div>
    <div class="card">
      <h3>Total Trades</h3>
      <div class="value">${stats?.total || 0}</div>
    </div>
    <div class="card">
      <h3>Win Rate</h3>
      <div class="value green">${stats?.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0.0'}%</div>
    </div>
    <div class="card">
      <h3>Total PnL</h3>
      <div class="value ${(stats?.total_pnl || 0) >= 0 ? 'green' : 'red'}">$${(stats?.total_pnl || 0).toFixed(2)}</div>
    </div>
    <div class="card">
      <h3>Pairs</h3>
      <div class="value blue">${this.#config.pairs.length}</div>
    </div>
  </div>

  ${positions.length ? `
  <div class="section">
    <h2>📊 Open Positions</h2>
    <table>
      <tr><th>ID</th><th>Pair</th><th>Side</th><th>Entry</th><th>Qty</th><th>SL</th><th>TP</th><th>Conf</th></tr>
      ${positions.map(p => `
        <tr>
          <td><code>${p.id}</code></td>
          <td>${p.pair}</td>
          <td><span class="badge ${p.side === 'long' ? 'badge-green' : 'badge-red'}">${p.side.toUpperCase()}</span></td>
          <td>$${p.entry_price?.toFixed(2) || '0'}</td>
          <td>${p.remaining_quantity || p.quantity || 0}</td>
          <td>$${p.stop_loss?.toFixed(2) || '0'}</td>
          <td>$${p.take_profit?.toFixed(2) || '0'}</td>
          <td>${p.ai_confidence || 0}%</td>
        </tr>
      `).join('')}
    </table>
  </div>
  ` : ''}

  <div class="section">
    <h2>📋 Recent Trades</h2>
    <table>
      <tr><th>ID</th><th>Pair</th><th>Side</th><th>PnL</th><th>ROI</th><th>Reason</th><th>Time</th></tr>
      ${recentTrades.map(t => `
        <tr>
          <td><code>${t.id}</code></td>
          <td>${t.pair}</td>
          <td><span class="badge ${t.side === 'long' ? 'badge-green' : 'badge-red'}">${t.side.toUpperCase()}</span></td>
          <td class="${t.pnl >= 0 ? 'green' : 'red'}">$${(t.pnl || 0).toFixed(2)}</td>
          <td>${(t.roi || 0).toFixed(2)}%</td>
          <td>${t.exit_reason || ''}</td>
          <td>${t.close_time?.substring(5, 16) || ''}</td>
        </tr>
      `).join('')}
    </table>
  </div>

  <div class="refresh">Auto-refresh: 30s | AI Agent V4 Production</div>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  #serveAPI(res) {
    const portfolio = this.#db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get();
    const positions = this.#db.prepare("SELECT * FROM positions WHERE status='open'").all();
    const stats = this.#db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins, COALESCE(SUM(pnl),0) as total_pnl FROM positions WHERE status='closed'").get();

    const data = {
      status: 'online',
      timestamp: new Date().toISOString(),
      mode: this.#config.trading.mode,
      pairs: this.#config.pairs,
      portfolio: portfolio,
      openPositions: positions.length,
      positions: positions,
      stats: stats,
      paused: this.#tradeManager.isPaused
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  #serveHealth(res) {
    const data = {
      status: 'ok',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  stop() {
    if (this.#server) {
      this.#server.close();
      this.#logger.info('Web dashboard stopped');
    }
  }
}
