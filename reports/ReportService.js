export class ReportService {
  #config; #logger; #db; #telegram; #intervals=[]; #lastDaily=null; #lastWeekly=null;
  constructor(c,l,db,tg) { this.#config=c; this.#logger=l; this.#db=db; this.#telegram=tg; }
  start() {
    this.#intervals.push(setInterval(()=>{
      const n=new Date(); const today=n.toDateString();
      if(n.getHours()===0&&n.getMinutes()===0&&this.#lastDaily!==today){this.#lastDaily=today;this.#daily();}
      if(n.getDay()===0&&n.getHours()===0&&n.getMinutes()===0&&this.#lastWeekly!==today){this.#lastWeekly=today;this.#weekly();}
    },60000));
    this.#logger.info('Report service started');
  }
  async #daily() {
    try {
      const r=this.#db.prepare("SELECT COUNT(*) as t,SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as w,COALESCE(SUM(pnl),0) as pnl FROM positions WHERE status='closed' AND close_time>=datetime('now','-1 day')").get();
      const wr=r.t>0?((r.w/r.t)*100).toFixed(1):'0';
      const t=new Date().toISOString().replace('T',' ').substring(0,19);
      await this.#telegram.sendReport('📊 <b>DAILY</b>\n\nTrades: '+r.t+'\nWins: '+r.w+'\nWin Rate: '+wr+'%\nPnL: $'+r.pnl.toFixed(2)+'\n\n🕐 '+t);
    } catch(e){this.#logger.error('Daily report:',e.message);}
  }
  async #weekly() {
    try {
      const r=this.#db.prepare("SELECT COUNT(*) as t,SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as w,COALESCE(SUM(pnl),0) as pnl FROM positions WHERE status='closed' AND close_time>=datetime('now','-7 days')").get();
      const wr=r.t>0?((r.w/r.t)*100).toFixed(1):'0';
      const t=new Date().toISOString().replace('T',' ').substring(0,19);
      await this.#telegram.sendReport('📊 <b>WEEKLY</b>\n\nTrades: '+r.t+'\nWins: '+r.w+'\nWin Rate: '+wr+'%\nPnL: $'+r.pnl.toFixed(2)+'\n\n🕐 '+t);
    } catch(e){this.#logger.error('Weekly report:',e.message);}
  }
  stop() { this.#intervals.forEach(i=>clearInterval(i)); this.#intervals=[]; }
}
