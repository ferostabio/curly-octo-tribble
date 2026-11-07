import { renderHook, waitFor } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import * as SQLite from 'expo-sqlite';
import { initializeMockSession, signOut, type Session } from '@/api/auth';
import * as api from '@/api/documents';
import { db } from '@/db/client';
import { loadQueue, saveDocument } from '@/db/queue-store';
import { enqueueDocument, syncDocuments, useDocumentSync } from '@/review';
import type { QueuedDocument } from '@/queue';

const mockStorage = new Map<string, string>();
let session: Session;
let mockExists = true;
const legacyKey = 'pending_document_queue:demo-worker';
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStorage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mockStorage.set(key, value); },
  deleteItemAsync: async (key: string) => { mockStorage.delete(key); },
}));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: async () => ({ isConnected: true }) } }));
jest.mock('expo-file-system', () => ({ File: jest.fn(() => ({ get exists() { return mockExists; } })) }));
function doc(id = 'a'): QueuedDocument {
  return { id, workerId: 'demo-worker', localUri: 'file:///sample', checksum: 'same', retries: 0, state: 'pending' };
}
async function seed(...items: QueuedDocument[]) {
  for (const item of items) await saveDocument(session, item);
}
function holdUpload() {
  let finish = () => {};
  let started = () => {};
  const ready = new Promise<void>((resolve) => { started = resolve; });
  jest.spyOn(api, 'uploadDocument').mockImplementationOnce((input) => new Promise((resolve) => {
    finish = () => resolve({ id: input.id, workerId: input.workerId,
      checksum: input.checksum, uploadedAt: 1 });
    started();
  }));
  return { ready, finish: () => finish() };
}
beforeEach(async () => {
  await signOut();
  mockStorage.clear();
  mockExists = true;
  session = await initializeMockSession();
});
afterEach(() => jest.restoreAllMocks());

test('missing SQLCipher fails closed and opening can retry', async () => {
  const sqlite = await SQLite.openDatabaseAsync('document-queue.db');
  jest.spyOn(sqlite, 'getFirstAsync').mockResolvedValueOnce(null);
  await expect(loadQueue(session)).rejects.toThrow('SQLCipher');
  expect(await loadQueue(session)).toEqual([]);
});
test('concurrent enqueues retain distinct IDs with identical content and reject identity changes', async () => {
  await Promise.all([enqueueDocument(session, doc()), enqueueDocument(session, doc('b'))]);
  await enqueueDocument(session, doc());
  expect(await loadQueue(session)).toEqual([doc(), doc('b')]);
  await expect(enqueueDocument(session, { ...doc(), checksum: 'changed' })).rejects.toThrow('new document ID');
  await expect(enqueueDocument(session, { ...doc(), workerId: 'other' })).rejects.toThrow('owner');
});
test('enqueue during upload survives the flush snapshot', async () => {
  await seed(doc('slow'));
  const held = holdUpload();
  const syncing = syncDocuments(session);
  await held.ready;
  const adding = enqueueDocument(session, doc('late'));
  held.finish();
  await Promise.all([syncing, adding]);
  expect(await loadQueue(session)).toEqual([doc('late')]);
});
test('logout cancels old work and isolates the next account', async () => {
  await seed(doc());
  const held = holdUpload();
  const syncing = syncDocuments(session);
  await held.ready;
  await signOut();
  const other = await initializeMockSession('other');
  held.finish();
  await expect(syncing).rejects.toThrow('Session ended');
  expect(await loadQueue(other)).toEqual([]);
  await signOut();
  expect(await loadQueue(await initializeMockSession())).toEqual([doc()]);
});
test.each([401, 429, 503, 'missing'])('failure %s never drops a document', async (status) => {
  await seed({ ...doc(), retries: 10 });
  mockExists = status !== 'missing';
  if (typeof status === 'number') jest.spyOn(api, 'uploadDocument').mockRejectedValue(new api.UploadError(status, 'failure'));
  await syncDocuments(session);
  expect(await loadQueue(session)).toMatchObject([{ state: status === 401 || status === 'missing' ? 'blocked' : 'pending' }]);
});
test.each(['{', '[null]', JSON.stringify([{ ...doc(), workerId: 'other' }])])('corrupt legacy queue %s is preserved', async (raw) => {
  mockStorage.set(legacyKey, raw);
  await expect(syncDocuments(session)).rejects.toThrow('invalid');
  await expect(enqueueDocument(session, doc())).rejects.toThrow('invalid');
  expect(mockStorage.get(legacyKey)).toBe(raw);
});
test('large SQLite queues survive failed transactions without SecureStore payloads', async () => {
  const items = Array.from({ length: 100 }, (_, i) => doc(String(i)));
  await seed(...items);
  const sqlite = await SQLite.openDatabaseAsync('document-queue.db');
  jest.spyOn(sqlite, 'runAsync').mockRejectedValueOnce(new Error('Disk full'));
  await expect(saveDocument(session, doc('failed'))).rejects.toThrow('Disk full');
  expect(await loadQueue(session)).toEqual(items);
  expect(mockStorage.has(legacyKey)).toBe(false);
});
test('acknowledged uploads only retry local confirmation', async () => {
  await seed(doc('ack'));
  session.expiresAt = 0;
  const upload = jest.spyOn(api, 'uploadDocument');
  jest.spyOn(db, 'confirm').mockRejectedValueOnce(new Error('Local DB unavailable'));
  await syncDocuments(session);
  expect((await loadQueue(session))[0].state).toBe('uploaded');
  mockExists = false;
  await syncDocuments(session);
  expect(await loadQueue(session)).toEqual([]);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(session.expiresAt).toBeGreaterThan(Date.now());
});

test('background sync reports rejected network calls', async () => {
  jest.spyOn(NetInfo, 'fetch').mockRejectedValueOnce(new Error('Offline'));
  const { result } = await renderHook(() => useDocumentSync(session));
  await waitFor(() => expect(result.current.syncError).toContain('Offline'));
});
