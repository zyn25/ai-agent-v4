import 'dotenv/config';

const token = process.env.OPENROUTER_API_KEY;
console.log('AI Enabled:', process.env.AI_ENABLED);
console.log('API Key:', token ? token.substring(0,10) + '...' : 'NONE');

try {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [{
        role: 'user',
        content: `Validate this signal: BTC/USDT LONG, confidence 75%, EMA bullish, RSI 58, MACD bullish_momentum, Volume high. Reply in JSON: {"decision":"approve/reject/wait","confidence":0-100,"reason":"brief"}`
      }],
      max_tokens: 200,
      temperature: 0.1
    })
  });

  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', data.choices[0].message.content);
  console.log('Tokens:', data.usage.total_tokens);
  console.log('Cost: $' + (data.usage.total_tokens * 0.0000025).toFixed(6));
  console.log('');
  console.log('✅ AI WORKING!');
} catch(e) {
  console.error('❌ AI ERROR:', e.message);
}
