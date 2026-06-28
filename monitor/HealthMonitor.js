import { cpus, totalmem, freemem } from 'os';
export class HealthMonitor {
  #config; #logger; #telegram; #db; #exchange; #interval=null; #alerts=new Map();
  constructor(c,l,tg,db,ex) { this.#config=c; this.#logger=l; this.#telegram=tg; this.#db=db; this.#exchange=ex; }
  start() { this.#interval=setInterval(()=>this.#check(),60000); this.#logger.info('Health monitor started'); }
  async #check() {
    try {
      const ci=cpus(); let idle=0,total=0;
      ci.forEach(c=>{for(const t in c.times)total+=c.times[t];idle+=c.times.idle;});
      const cpu=Math.round(((total-idle)/total)*100);
      const ram=Math.round(((totalmem()-freemem())/totalmem())*100);
      let exOk=1; try{await this.#exchange.fetchTicker(this.#config.exchange.pair);}catch{exOk=0;}
      let dbOk=1; try{this.#db.prepare('SELECT 1').get();}catch{dbOk=0;}
      const op=this.#db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='open'").get();
      this.#db.prepare('INSERT INTO performance (cpu_usage,ram_usage,exchange_connected,telegram_connected,db_healthy,open_positions) VALUES (?,?,?,?,?,?)').run(cpu,ram,exOk,this.#telegram?1:0,dbOk,op?.c||0);
      await this.#alert('cpu',cpu,90,'CPU: '+cpu+'%');
      await this.#alert('ram',ram,90,'RAM: '+ram+'%');
      if(!exOk) await this.#alert('ex',0,0,'Exchange DOWN');
    } catch(e) { this.#logger.error('Health:',e.message); }
  }
  async #alert(k,v,th,msg) { if(v>=th||th===0){const l=this.#alerts.get(k);if(l&&Date.now()-l<300000)return;await this.#telegram.sendAlert(msg);this.#alerts.set(k,Date.now());} }
  stop() { if(this.#interval){clearInterval(this.#interval);this.#interval=null;} }
}
