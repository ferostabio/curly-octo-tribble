// Real SQL and rollback, with a key required separately on every connection.
const { DatabaseSync } = require('node:sqlite');
const sql = new DatabaseSync(':memory:');
const connections = [];
function connect() {
  let keyed = false;
  function prepare(query) {
    if (!keyed) throw new Error('Database connection requires an encryption key');
    return sql.prepare(query);
  }
  const connection = {
    async execAsync(query) {
      if (query.startsWith('PRAGMA key = ')) keyed = true;
      else sql.exec(query);
    },
    async runAsync(query, ...params) { return prepare(query).run(...params); },
    async getAllAsync(query, ...params) { return prepare(query).all(...params); },
    async getFirstAsync(query, ...params) {
      return query === 'PRAGMA cipher_version' ? { cipher_version: 'test-double' } : prepare(query).get(...params);
    },
    async withTransactionAsync(work) {
      sql.exec('BEGIN');
      try { await work(); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
    async closeAsync() {},
  };
  connections.push(connection);
  return connection;
}
module.exports = {
  openDatabaseAsync: async () => connect(),
  connections,
  reset() {
    if (sql.prepare("SELECT name FROM sqlite_master WHERE name='queue'").get()) sql.exec('DELETE FROM queue');
  },
};
