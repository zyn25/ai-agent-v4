export class BaseRepository {
  #db; #table;
  constructor(database, tableName) { this.#db = database; this.#table = tableName; }
  get db() { return this.#db; }
  findById(id) { return this.#db.prepare('SELECT * FROM ' + this.#table + ' WHERE id=?').get(id); }
  findAll(limit = 100) { return this.#db.prepare('SELECT * FROM ' + this.#table + ' ORDER BY created_at DESC LIMIT ?').all(limit); }
}
