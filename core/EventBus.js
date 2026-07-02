import { EventEmitter } from 'events';
export class EventBus extends EventEmitter {
  constructor(maxListeners = 50) {
    super();
    this.setMaxListeners(maxListeners);
  }
  safeEmit(event, ...args) {
    try {
      const hasListeners = this.listenerCount(event) > 0;
      if (!hasListeners) return false;
      return this.emit(event, ...args);
    } catch (error) {
      return false;
    }
  }
}
