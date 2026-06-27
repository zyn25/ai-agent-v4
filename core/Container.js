export class Container {
  #services = new Map();
  register(name, instance) { this.#services.set(name, instance); }
  resolve(name) {
    const s = this.#services.get(name);
    if (!s) throw new Error(`Service '${name}' not found`);
    return s;
  }
  has(name) { return this.#services.has(name); }
}
