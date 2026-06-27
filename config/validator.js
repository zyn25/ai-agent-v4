export function validateEnv() {
  const required = ['EXCHANGE_NAME', 'TRADING_PAIR', 'TRADING_MODE'];
  const missing = required.filter((v) => !process.env[v]);
  if (process.env.TRADING_MODE === 'live') {
    ['EXCHANGE_API_KEY', 'EXCHANGE_SECRET'].forEach((v) => { if (!process.env[v]) missing.push(v); });
  }
  if (process.env.AI_ENABLED !== 'false') {
    ['OPENROUTER_API_KEY'].forEach((v) => { if (!process.env[v]) missing.push(v); });
  }
  if (process.env.TELEGRAM_ENABLED !== 'false') {
    ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].forEach((v) => { if (!process.env[v]) missing.push(v); });
  }
  if (missing.length > 0) {
    console.error('Missing environment variables:');
    missing.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }
}
