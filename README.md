# AI Agent V4 Production

Enterprise-grade AI Paper Trading Platform.

## Quick Start
git clone https://github.com/zyn25/ai-agent-v4.git
cd ai-agent-v4
npm install
cp .env.example .env
nano .env
node app.js

## PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

## Architecture
- config/ - Environment configuration
- core/ - Container, EventBus, Logger
- database/ - SQLite, migrations, repositories
- exchange/ - CCXT exchange connectivity
- strategy/ - Signal engine, indicators, filters
- risk/ - Risk management, position sizing
- trade/ - Trade manager, position lifecycle
- telegram/ - Notifications and commands
- ai/ - AI signal validation
- reports/ - Performance reports
- monitor/ - Health monitoring
- utils/ - Constants and helpers
- backtest/ - Backtesting engine
- tests/ - Unit and integration tests

## Commands (25)
/status /positions /balance /trades /stats /equity
/orderbook /kelly /summary /analytics /journal
/config /risk /health /mode
/aggressive /balanced /conservative /scalping
/pause /resume /closeall /closelast
/start /help

## Dependencies
- ccxt (exchange)
- sql.js (database)
- node-telegram-bot-api (telegram)
- dotenv (environment)
- technicalindicators (EMA, RSI, MACD, ATR)
