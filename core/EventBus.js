import { EventEmitter } from 'events';
export class EventBus extends EventEmitter {
  constructor(maxListeners = 50) {
    super();
    this.setMaxListeners(maxListeners);
  }
  safeEmit(event, ...args) {
    try { return this.emit(event, ...args); }
    catch (error) { this.emit('error', { event, error }); return false; }
  }
}
