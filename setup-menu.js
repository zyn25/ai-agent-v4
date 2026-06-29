import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;

try {
  // Set bot description
  const desc = await fetch('https://api.telegram.org/bot' + token + '/setMyDescription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: '🤖 AI Agent V4 - Professional Paper Trading Bot\n\nMulti-pair (BTC, ETH, SOL)\nMulti-timeframe (15m, 1h, 4h)\nAI Validation • Orderbook Analysis\nRisk Management • Auto Backup'
    })
  });
  console.log('Description:', (await desc.json()).ok ? '✅' : '❌');

  // Set short description (shown in profile)
  const shortDesc = await fetch('https://api.telegram.org/bot' + token + '/setMyShortDescription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      short_description: '🤖 AI Paper Trading Bot | BTC ETH SOL | /help'
    })
  });
  console.log('Short description:', (await shortDesc.json()).ok ? '✅' : '❌');

  // Set bot name
  const name = await fetch('https://api.telegram.org/bot' + token + '/setMyName', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'AI Agent V4'
    })
  });
  console.log('Name:', (await name.json()).ok ? '✅' : '❌');

  console.log('');
  console.log('✅ Bot profile updated!');
} catch (e) {
  console.error('❌ Error:', e.message);
}
