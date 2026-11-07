import * as SecureStore from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { decodeQueue, type DocumentInput, type QueuedDocument } from '@/queue';
import { assertSession, type Session } from '@/api/auth';
import { createSerialExecutor } from '@/serial';

const serialize = createSerialExecutor();
let database: Promise<SQLiteDatabase> | undefined;
async function openQueue() {
  let key = await SecureStore.getItemAsync('queue_database_key');
  if (key === null) {
    key = Array.from(await getRandomBytesAsync(32), (byte) => byte.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync('queue_database_key', key);
  }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid queue encryption key');
  const db = await openDatabaseAsync('document-queue.db', { useNewConnection: true });
  try {
    await db.execAsync(`PRAGMA key = "x'${key}'"`);
    if (!(await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version'))?.cipher_version) {
      throw new Error('Encrypted queue requires a SQLCipher development build');
    }
    await db.execAsync('CREATE TABLE IF NOT EXISTS queue (worker TEXT, id TEXT, payload TEXT NOT NULL, PRIMARY KEY(worker, id))');
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}
function getDatabase() {
  database ??= openQueue().catch((error) => { database = undefined; throw error; });
  return database;
}
// All access uses the same keyed connection; uploads never hold this lock.
function writeQueue(session: Session, work: (db: SQLiteDatabase) => Promise<unknown>) {
  return serialize(async () => {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      assertSession(session);
      await work(db);
      assertSession(session);
    });
  });
}

async function readQueue(db: SQLiteDatabase, session: Session) {
  const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM queue WHERE worker = ? ORDER BY rowid', session.workerId);
  return rows.flatMap((row) => decodeQueue(`[${row.payload}]`, session.workerId));
}
export function loadQueue(session: Session) {
  return serialize(async () => {
    const db = await getDatabase();
    assertSession(session);
    const queue = await readQueue(db, session);
    assertSession(session);
    return queue;
  });
}
export function enqueueDocument(session: Session, doc: DocumentInput) {
  return writeQueue(session, async (db) => {
    if (doc.workerId !== session.workerId) throw new Error('Document owner mismatch');
    const existing = (await readQueue(db, session)).find((item) => item.id === doc.id);
    if (existing && existing.checksum !== doc.checksum) {
      throw new Error('Document content changed; use a new document ID');
    }
    if (!existing) await db.runAsync('INSERT INTO queue VALUES (?, ?, ?)', session.workerId, doc.id,
      JSON.stringify({ ...doc, retries: 0, state: 'pending' }));
  });
}
export function saveDocument(session: Session, doc: QueuedDocument) {
  return writeQueue(session, (db) => db.runAsync('UPDATE queue SET payload = ? WHERE worker = ? AND id = ?',
    JSON.stringify(doc), session.workerId, doc.id));
}
export function removeDocument(session: Session, id: string) {
  return writeQueue(session, (db) => db.runAsync('DELETE FROM queue WHERE worker = ? AND id = ?', session.workerId, id));
}
