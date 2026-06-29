/**
 * Builds structured prompts for AI signal validation.
 * Returns ALL fields required by master prompt:
 * Approve/Reject/Wait, Confidence, Reason,
 * Risk Level, Trend Strength, Momentum, Volume Analysis, Market Condition
 */
export class PromptBuilder {
  build(signal) {
    const i = signal.indicators?.primary?.indicators || {};
    return `You are a crypto trading signal validator. Analyze this signal and respond in JSON only.

SIGNAL:
- Side: ${signal.side}
- Confidence: ${signal.confidence}%
- Timeframe Alignment: ${signal.reason}

INDICATORS:
- EMA Cross: ${i.ema?.cross || 'N/A'}
- RSI: ${i.rsi?.value?.toFixed(1) || 'N/A'} (${i.rsi?.interpret || 'N/A'})
- MACD: ${i.macd?.interpret || 'N/A'}
- ATR: ${i.atr?.value?.toFixed(4) || 'N/A'}
- Volume: ${i.volume?.interpret || 'N/A'} (ratio: ${i.volume?.ratio?.toFixed(2) || 'N/A'})

RESPOND IN JSON ONLY:
{
  "decision": "approve" or "reject" or "wait",
  "confidence": 0-100,
  "reason": "brief reason",
  "riskLevel": "low" or "medium" or "high",
  "trendStrength": "weak" or "moderate" or "strong",
  "momentum": "bullish" or "bearish" or "neutral",
  "volumeAnalysis": "supportive" or "neutral" or "concerning",
  "marketCondition": "trending" or "ranging" or "volatile"
}`;
  }
}
