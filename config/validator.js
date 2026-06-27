export function validateEnv() {
  const required = ['EXCHANGE_NAME', 'TRADING_PAIR', 'TRADING_MODE'];
  const missing = required.filter((v) => !process.env[v]);

  // API key only required for LIVE mode
  if (process.env.TRADING_MODE === 'live') {
    ['EXCHANGE_API_KEY', 'EXCHANGE_SECRET'].forEach((v) => {
      if (!process.env[v]) missing.push(v);
    });
  }

  // AI is optional - skip if key not provided
  if (process.env.AI_ENABLED === 'true' && !process.env.OPENROUTER_API_KEY) {
    console.warn('WARNING: AI_ENABLED=true but no OPENROUTER_API_KEY. AI will fallback to approve.');
    process.env.AI_ENABLED = 'false';
  }

  // Telegram is optional
  if (process.env.TELEGRAM_ENABLED === 'true' && !process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('WARNING: No TELEGRAM_BOT_TOKEN. Telegram disabled.');
    process.env.TELEGRAM_ENABLED = 'false';
  }

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }
}
