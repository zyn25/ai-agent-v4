export class Container {
  #services = new Map();
  register(name, instance) { this.#services.set(name, instance); }
  resolve(name) {
    if (!this.#services.has(name)) throw new Error(`Service '${name}' not found`);
    return this.#services.get(name);
  }
  has(name) { return this.#services.has(name); }
}
