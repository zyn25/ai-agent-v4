import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;

const commands = [
  // Info
  { command: 'start', description: '🚀 Start bot' },
  { command: 'help', description: '📋 Show all commands' },
  { command: 'status', description: '📊 Dashboard overview' },
  { command: 'positions', description: '📋 Open positions' },
  { command: 'balance', description: '💰 Account balance' },
  { command: 'trades', description: '📜 Recent trades' },
  { command: 'stats', description: '📈 All-time statistics' },
  { command: 'equity', description: '📉 Equity curve' },

  // Analysis
  { command: 'orderbook', description: '📖 Orderbook analysis' },
  { command: 'kelly', description: '🎯 Kelly criterion sizing' },
  { command: 'summary', description: '📊 30-day performance' },
  { command: 'analytics', description: '🔬 Advanced analytics' },
  { command: 'journal', description: '📄 Export trade journal' },

  // Settings
  { command: 'config', description: '⚙️ Bot configuration' },
  { command: 'risk', description: '🛡️ Risk settings' },
  { command: 'health', description: '🏥 System health' },
  { command: 'mode', description: '🎯 Current strategy mode' },

  // Strategy
  { command: 'aggressive', description: '🔴 Aggressive mode' },
  { command: 'balanced', description: '🟡 Balanced mode' },
  { command: 'conservative', description: '🟢 Conservative mode' },
  { command: 'scalping', description: '⚡ Scalping mode' },

  // Emergency
  { command: 'pause', description: '⏸️ Pause trading' },
  { command: 'resume', description: '▶️ Resume trading' },
  { command: 'closeall', description: '🔴 Close all positions' },
  { command: 'closelast', description: '🔴 Close last position' },
];

console.log('Setting Telegram bot commands...');
console.log('Total commands: ' + commands.length);
console.log('');

try {
  const response = await fetch('https://api.telegram.org/bot' + token + '/setMyCommands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands })
  });

  const result = await response.json();

  if (result.ok) {
    console.log('✅ Commands set successfully!');
    console.log('');
    console.log('Commands registered:');
    commands.forEach((c, i) => {
      console.log('  ' + (i + 1) + '. /' + c.command + ' - ' + c.description);
    });
  } else {
    console.error('❌ Error:', result.description);
  }
} catch (e) {
  console.error('❌ Error:', e.message);
}
