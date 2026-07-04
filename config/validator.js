export function validateEnv() {
  const required = ['EXCHANGE_NAME', 'TRADING_PAIR', 'TRADING_MODE'];
  const missing = required.filter((v) => !process.env[v]);

  // 1. API key wajib hanya untuk mode LIVE
  if (process.env.TRADING_MODE === 'live') {
    ['EXCHANGE_API_KEY', 'EXCHANGE_SECRET'].forEach((v) => {
      if (!process.env[v]) missing.push(v);
    });
  }

  // 2. Validasi TRADING_MODE (Fail-Fast)
  const validModes = ['paper', 'live'];
  if (process.env.TRADING_MODE && !validModes.includes(process.env.TRADING_MODE)) {
    console.error(`ERROR: Invalid TRADING_MODE. Must be one of: ${validModes.join(', ')}`);
    process.exit(1);
  }

  // 3. AI Validation - Jangan ubah env secara diam-diam, cukup warning
  if (process.env.AI_ENABLED === 'true' && !process.env.OPENROUTER_API_KEY) {
    console.warn('WARNING: AI_ENABLED=false but no OPENROUTER_API_KEY. AI Validator akan memakai logic fallback (auto-approve). Pastikan ini disengaja!');
  }

  // 4. Telegram Validation - Jangan ubah env secara diam-diam, cukup warning
  if (process.env.TELEGRAM_ENABLED === 'true' && !process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('WARNING: TELEGRAM_ENABLED=true but no TELEGRAM_BOT_TOKEN. Telegram tidak akan mengirim notifikasi.');
  }

  // 5. Validasi Angka Wajib (Fail-Fast untuk mencegah NaN bug di indikator)
  const numericVars = ['LEVERAGE', 'EMA_FAST', 'EMA_SLOW'];
  for (const v of numericVars) {
    const val = process.env[v];
    if (val && isNaN(Number(val))) {
      console.error(`ERROR: Environment variable ${v} harus berupa angka, ditemukan: "${val}"`);
      process.exit(1);
    }
  }

  // 6. Jika ada variabel wajib yang hilang, stop aplikasi
  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }
}
