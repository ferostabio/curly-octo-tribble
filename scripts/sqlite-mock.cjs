// Exercise real SQL and rollback; native SQLCipher encryption is not simulated.
const { DatabaseSync } = require('node:sqlite');
const sql = new DatabaseSync(':memory:');
const connection = {
  async execAsync(query) { sql.exec(query); },
  async runAsync(query, ...params) { return sql.prepare(query).run(...params); },
  async getAllAsync(query, ...params) { return sql.prepare(query).all(...params); },
  async getFirstAsync(query, ...params) {
    return query === 'PRAGMA cipher_version' ? { cipher_version: 'test-double' } : sql.prepare(query).get(...params);
  },
  async withExclusiveTransactionAsync(work) {
    sql.exec('BEGIN');
    try { await work(connection); sql.exec('COMMIT'); }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
  async closeAsync() {},
};
module.exports = {
  openDatabaseAsync: async () => connection,
  reset() {
    for (const { name } of sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
      sql.exec(`DELETE FROM "${name}"`);
    }
  },
};
