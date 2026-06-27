export class PositionManager {
  #positions = new Map();
  track(pos) { this.#positions.set(pos.id, { ...pos, break_even_applied: false, unrealized_pnl: 0 }); }
  update(id, fields) { const p = this.#positions.get(id); if (p) Object.assign(p, fields); }
  remove(id) { this.#positions.delete(id); }
  get(id) { return this.#positions.get(id); }
  getAll() { return Array.from(this.#positions.values()); }
  count() { return this.#positions.size; }
}
