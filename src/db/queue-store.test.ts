import * as SecureStore from 'expo-secure-store';
import { openDatabaseAsync } from 'expo-sqlite';
import { initializeMockSession, signOut } from '@/api/auth';
import { enqueueDocument, loadQueue } from '@/db/queue-store';

test.each(['{', '{}', 'null', '{"workerId":"foreign"}'])('invalid SQLite payload is preserved: %s', async (raw) => {
  await signOut();
  const session = await initializeMockSession();
  await loadQueue(session);
  const sqlite = jest.requireMock<{ connections: Awaited<ReturnType<typeof openDatabaseAsync>>[] }>('expo-sqlite');
  const db = sqlite.connections[0];
  await db.runAsync('INSERT INTO queue VALUES (?, ?, ?)', session.workerId, 'bad', raw);
  await expect(loadQueue(session)).rejects.toThrow('invalid');
  await expect(enqueueDocument(session, { id: 'new', workerId: session.workerId, localUri: 'file:///new', checksum: 'hash' }))
    .rejects.toThrow('invalid');
  expect(await db.getFirstAsync('SELECT payload FROM queue WHERE id = ?', 'bad')).toEqual({ payload: raw });
});

test('SecureStore enforces the real key contract', async () => {
  await expect(SecureStore.getItemAsync('pending_document_queue:worker')).rejects.toThrow('Invalid key');
});

test('missing SQLCipher support fails closed', async () => {
  await signOut();
  await jest.isolateModulesAsync(async () => {
    const sqlite = jest.requireMock<typeof import('expo-sqlite')>('expo-sqlite');
    const connection = await sqlite.openDatabaseAsync('document-queue.db');
    jest.spyOn(connection, 'getFirstAsync').mockResolvedValueOnce(null);
    jest.spyOn(sqlite, 'openDatabaseAsync').mockResolvedValueOnce(connection);
    const auth = jest.requireActual<typeof import('@/api/auth')>('@/api/auth');
    const store = jest.requireActual<typeof import('@/db/queue-store')>('@/db/queue-store');
    await expect(store.loadQueue(await auth.initializeMockSession())).rejects.toThrow('SQLCipher');
  });
});

test('logout after an INSERT rolls the entire transaction back', async () => {
  await signOut();
  const session = await initializeMockSession();
  await loadQueue(session);
  const sqlite = jest.requireMock<{ connections: Awaited<ReturnType<typeof openDatabaseAsync>>[] }>('expo-sqlite');
  const db = sqlite.connections[0];
  const run = db.runAsync.bind(db);
  jest.spyOn(db, 'runAsync').mockImplementationOnce(async (...args) => {
    const result = await run(...args);
    await signOut();
    return result;
  });
  await expect(enqueueDocument(session, { id: 'aborted', workerId: session.workerId, localUri: 'file:///a', checksum: 'a' }))
    .rejects.toThrow('Session ended');
  expect(await loadQueue(await initializeMockSession())).toEqual([]);
});
