export class BaseRepository {
  #db; #tableName;
  constructor(database, tableName) { this.#db = database; this.#tableName = tableName; }
  get db() { return this.#db; }
  findById(id) { return this.#db.prepare(`SELECT * FROM ${this.#tableName} WHERE id = ?`).get(id); }
  findAll(limit = 100) { return this.#db.prepare(`SELECT * FROM ${this.#tableName} ORDER BY created_at DESC LIMIT ?`).all(limit); }
}
