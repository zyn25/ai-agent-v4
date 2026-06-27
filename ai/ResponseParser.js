export class ResponseParser {
  parse(response) {
    try {
      const match = response.match(/\{[\s\S]*\}/);
      if (!match) return this.#fallback(response);
      const j = JSON.parse(match[0]);
      return { decision: ['approve','reject','wait'].includes(j.decision)?j.decision:'reject', confidence: Math.min(Math.max(parseInt(j.confidence)||0,0),100), reason: j.reason||'No reason' };
    } catch { return this.#fallback(response); }
  }
  #fallback(r) {
    const l = r.toLowerCase();
    let d = 'reject';
    if (l.includes('approve')||l.includes('good')) d = 'approve';
    else if (l.includes('wait')) d = 'wait';
    return { decision: d, confidence: 50, reason: 'Fallback parse' };
  }
}
