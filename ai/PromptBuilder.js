export class PromptBuilder {
  build(signal) {
    const i = signal.indicators?.primary?.indicators || {};
    return `You are a crypto trading signal validator. Respond in JSON only.\n\nSIGNAL: ${signal.side} | Confidence: ${signal.confidence}%\nEMA: ${i.ema?.cross||'N/A'} | RSI: ${i.rsi?.value?.toFixed(1)||'N/A'} | MACD: ${i.macd?.interpret||'N/A'} | Volume: ${i.volume?.interpret||'N/A'}\n\n{"decision":"approve/reject/wait","confidence":0-100,"reason":"brief"}`;
  }
}
