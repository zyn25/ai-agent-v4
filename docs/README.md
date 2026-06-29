# AI Agent V4 Documentation

## Architecture
- Clean Architecture with SOLID principles
- Repository Pattern for database access
- Service Layer for business logic
- Dependency Injection via Container

## Modules
| Module | Responsibility |
|--------|---------------|
| config/ | Environment variables and configuration |
| core/ | Container, EventBus, Logger |
| database/ | SQLite database, migrations, repositories |
| exchange/ | CCXT exchange connectivity |
| strategy/ | Signal engine, indicators, filters |
| risk/ | Risk management, position sizing |
| trade/ | Trade manager, position lifecycle |
| telegram/ | Telegram notifications and commands |
| ai/ | AI signal validation |
| reports/ | Performance reports and analytics |
| monitor/ | Health monitoring |
| utils/ | Utility functions |
| backtest/ | Backtesting engine |
| tests/ | Unit and integration tests |

## Telegram Commands (25)
/status /positions /balance /trades /stats /equity
/orderbook /kelly /summary /analytics /journal
/config /risk /health /mode
/aggressive /balanced /conservative /scalping
/pause /resume /closeall /closelast
/start /help

## Trading Flow
1. Session Filter → Check market hours
2. Market Filter → Volume, ranging, volatility check
3. Signal Engine → EMA, RSI, MACD, ATR, Volume analysis
4. Trend Filter → Multi-timeframe alignment
5. Correlation Check → Prevent duplicate exposure
6. Orderbook Analysis → Bid/Ask ratio, spread, walls
7. AI Validation → Approve/Reject/Wait
8. Risk Check → Position sizing, circuit breaker
9. Execute → Open position
10. Monitor → SL, TP, BE, Trailing, Partial TP
11. Close → Record PnL, update portfolio

## Strategy Modes
| Mode | Confidence | Risk | Cooldown |
|------|-----------|------|----------|
| Aggressive | 60% | 1.5% | 15min |
| Balanced | 80% | 1% | 30min |
| Conservative | 90% | 0.5% | 60min |
| Scalping | 55% | 0.5% | 5min |

## Deployment
- VPS: Ubuntu 22.04+
- Process Manager: PM2
- Auto-restart: Yes
- Auto-backup: Every 6 hours
