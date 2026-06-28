export class CircuitBreaker {
  #config; #logger; #db; #paused=false; #reason=''; #pauseTime=null; #lastResetDate=null;
  constructor(c,l,db) { this.#config=c; this.#logger=l; this.#db=db; }

  async check() {
    this.#autoResetDaily();
    if(this.#paused) { if(this.#shouldResume()) { this.#paused=false; this.#reason=''; this.#pauseTime=null; this.#logger.info('Circuit breaker RESUMED'); return{allowed:true}; } return{allowed:false,reason:this.#reason}; }
    const p=this.#db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get();
    if(!p) return{allowed:true};
    if(p.peak_balance&&p.peak_balance>0) { const dd=((p.peak_balance-p.balance)/p.peak_balance)*100; if(dd>=this.#config.risk.maxDrawdown) { this.#pause('Max drawdown '+dd.toFixed(1)+'%'); return{allowed:false,reason:'Max drawdown'}; } }
    if(p.daily_pnl<0&&p.balance>0) { const pct=Math.abs(p.daily_pnl/p.balance)*100; if(pct>=this.#config.risk.maxDailyLoss) { this.#pause('Daily loss '+pct.toFixed(1)+'%'); return{allowed:false,reason:'Daily loss limit'}; } }
    if(p.weekly_pnl<0&&p.balance>0) { const pct=Math.abs(p.weekly_pnl/p.balance)*100; if(pct>=this.#config.risk.maxWeeklyLoss) { this.#pause('Weekly loss '+pct.toFixed(1)+'%'); return{allowed:false,reason:'Weekly loss limit'}; } }
    const c=this.#getConsec(); if(c>=this.#config.risk.maxConsecutiveLosses) { this.#pause('Consec losses '+c); return{allowed:false,reason:'Consec losses: '+c}; }
    return{allowed:true};
  }

  #autoResetDaily() {
    const today = new Date().toDateString();
    if (this.#lastResetDate !== today) {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        this.#lastResetDate = today;
        this.#db.prepare("UPDATE portfolio SET daily_pnl=0,updated_at=datetime('now')").run();
        if (this.#paused && this.#reason.includes('Daily')) {
          this.#paused = false;
          this.#reason = '';
          this.#pauseTime = null;
          this.#logger.info('Circuit breaker auto-resumed after daily reset');
        }
        this.#logger.info('Daily PnL reset');
      }
    }
  }

  async recordLoss() { const c=this.#getConsec(); if(c>=this.#config.risk.maxConsecutiveLosses) this.#pause('Consec losses '+c); }
  async resetDaily() { this.#db.prepare("UPDATE portfolio SET daily_pnl=0,updated_at=datetime('now')").run(); this.#logger.info('Daily PnL reset'); }
  #pause(r) { this.#paused=true; this.#reason=r; this.#pauseTime=new Date().toISOString(); this.#db.prepare("INSERT INTO system_logs (level,category,message) VALUES (?,?,?)").run('warn','circuit_breaker','PAUSED: '+r); this.#logger.warn('Circuit breaker PAUSED: '+r); }
  #shouldResume() { if(!this.#pauseTime)return true; return new Date().toDateString()!==new Date(this.#pauseTime).toDateString(); }
  #getConsec() { const t=this.#db.prepare("SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 20").all(); let c=0; for(const x of t){if(x.pnl<=0)c++;else break;} return c; }
  get isPaused() { return this.#paused; }
  get pauseReason() { return this.#reason; }
}
