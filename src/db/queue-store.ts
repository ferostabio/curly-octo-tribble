import * as SecureStore from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { decodeQueue, type QueuedDocument } from '@/queue';
import { assertSession, type Session } from '@/api/auth';

let database: Promise<SQLiteDatabase> | undefined;
async function openQueue() {
  let key = await SecureStore.getItemAsync('queue_database_key');
  if (key === null) {
    key = Array.from(await getRandomBytesAsync(32), (byte) => byte.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync('queue_database_key', key);
  }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid queue encryption key');
  const db = await openDatabaseAsync('document-queue.db');
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
export async function persistQueue(session: Session, queue: QueuedDocument[]) {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    assertSession(session);
    await tx.runAsync('DELETE FROM queue WHERE worker = ?', session.workerId);
    for (const doc of queue) {
      await tx.runAsync('INSERT INTO queue VALUES (?, ?, ?)', session.workerId, doc.id, JSON.stringify(doc));
    }
    assertSession(session);
  });
}
export async function loadQueue(session: Session): Promise<QueuedDocument[]> {
  const db = await getDatabase();
  assertSession(session);
  const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM queue WHERE worker = ? ORDER BY rowid', session.workerId);
  const stored = rows.flatMap((row) => decodeQueue(`[${row.payload}]`, session.workerId));
  const key = `pending_document_queue:${encodeURIComponent(session.workerId)}`;
  const legacy = await SecureStore.getItemAsync(key);
  if (legacy === null) return stored;
  const migrated = decodeQueue(legacy, session.workerId);
  if (migrated.some((doc) => stored.some((item) => item.id === doc.id &&
    (item.checksum !== doc.checksum || item.localUri !== doc.localUri)))) {
    throw new Error('Legacy queue conflicts with SQLite; original data retained');
  }
  const merged = [...stored, ...migrated.filter((doc) => !stored.some((item) => item.id === doc.id))];
  await persistQueue(session, merged);
  // Keep the legacy value until the SQL transaction has committed successfully.
  await SecureStore.deleteItemAsync(key);
  return merged;
}
