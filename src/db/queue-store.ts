import * as SecureStore from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';
import { decodeQueue, type QueuedDocument } from '@/queue';
import { assertSession, type Session } from '@/api/auth';

let database: ReturnType<typeof openQueue> | undefined;
async function openQueue() {
  let key = await SecureStore.getItemAsync('queue_database_key');
  if (key === null) {
    key = Array.from(await getRandomBytesAsync(32), (n) => n.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync('queue_database_key', key);
  }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid encryption key');
  const db = await openDatabaseAsync('document-queue.db');
  try {
    await db.execAsync(`PRAGMA key = "x'${key}'"`);
    if (!(await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version'))?.cipher_version) {
      throw new Error('SQLCipher development build required');
    }
    await db.execAsync('CREATE TABLE IF NOT EXISTS queue (worker TEXT, id TEXT, payload TEXT NOT NULL, PRIMARY KEY(worker, id))');
    return db;
  } catch (error) { await db.closeAsync(); throw error; }
}
function getDatabase() {
  return database ??= openQueue().catch((error) => { database = undefined; throw error; });
}
async function write(session: Session, sql: string, ...values: string[]) {
  await (await getDatabase()).withExclusiveTransactionAsync(async (tx) => {
    assertSession(session);
    await tx.runAsync(sql, session.workerId, ...values);
    assertSession(session);
  });
}
export function saveDocument(session: Session, doc: QueuedDocument) {
  return write(session, 'INSERT INTO queue VALUES (?, ?, ?) ON CONFLICT(worker, id) DO UPDATE SET payload = excluded.payload', doc.id, JSON.stringify(doc));
}
export function removeDocument(session: Session, id: string) {
  return write(session, 'DELETE FROM queue WHERE worker = ? AND id = ?', id);
}
export async function loadQueue(session: Session) {
  const db = await getDatabase();
  assertSession(session);
  const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM queue WHERE worker = ? ORDER BY rowid', session.workerId);
  const queue = decodeQueue(`[${rows.map((row) => row.payload).join(',')}]`, session.workerId);
  const key = `pending_document_queue:${encodeURIComponent(session.workerId)}`;
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return queue;
  for (const doc of decodeQueue(raw, session.workerId)) {
    const stored = queue.find((item) => item.id === doc.id);
    if (stored && (stored.checksum !== doc.checksum || stored.localUri !== doc.localUri)) throw new Error('Legacy conflict; original retained');
    if (!stored) { await saveDocument(session, doc); queue.push(doc); }
  }
  await SecureStore.deleteItemAsync(key);
  return queue;
}
