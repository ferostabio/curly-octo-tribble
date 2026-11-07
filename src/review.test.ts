import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { QueuedDocument } from '@/queue';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { loadQueue, persistQueue } from '@/db/queue-store';
import NetInfo from '@react-native-community/netinfo';

import * as documents from '@/api/documents';
import { db, getMockSyncResult } from '@/db/client';
import { initializeMockSession, signOut, type Session } from '@/api/auth';
import { useDocumentSync } from '@/review';

const mockStorage = new Map<string, string>();
let mockConnected = true;
let mockFileExists = true;
let session: Session;
const queueKey = 'pending_document_queue:demo-worker';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(async (key: string) => { mockStorage.delete(key); }),
  getItemAsync: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ isConnected: mockConnected })) },
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ get exists() { return mockFileExists; } })),
}));

function sample(id: string, retries = 0): QueuedDocument {
  return { id, localUri: `file:///mock/${id}.txt`, workerId: 'demo-worker', checksum: id, retries, state: 'pending' };
}

beforeEach(async () => {
  await signOut();
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockStorage.clear();
  mockConnected = true;
  mockFileExists = true;
  session = await initializeMockSession();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('mount runs review.ts, uploads queued data, records sync, and empties the queue', async () => {
  const doc = sample('success');
  mockStorage.set(queueKey, JSON.stringify([doc]));
  const upload = jest.spyOn(documents, 'uploadDocument');

  await renderHook(() => useDocumentSync(session));

  await waitFor(() => expect(getMockSyncResult(doc.id)?.synced).toBe(true));
  expect(upload).toHaveBeenCalledWith({
    uri: doc.localUri, workerId: doc.workerId, idempotencyKey: doc.id,
    token: 'mock:demo-worker', signal: session.controller.signal,
  });
  await waitFor(async () => expect(await loadQueue(session)).toEqual([]));
});

test('offline enqueue persists a document and ignores a duplicate checksum', async () => {
  mockConnected = false;
  const upload = jest.spyOn(documents, 'uploadDocument');
  const { result } = await renderHook(() => useDocumentSync(session));
  const doc = sample('offline');

  await act(async () => { await result.current.enqueue(doc); });
  await act(async () => { await result.current.enqueue({ ...doc, id: 'duplicate' }); });

  expect(await loadQueue(session)).toEqual([doc]);
  expect(upload).not.toHaveBeenCalled();
});

test('a queued document syncs on the next polling interval after reconnecting', async () => {
  mockConnected = false;
  const doc = sample('reconnect');
  mockStorage.set(queueKey, JSON.stringify([doc]));
  await renderHook(() => useDocumentSync(session));
  expect(getMockSyncResult(doc.id)).toBeUndefined();

  mockConnected = true;
  await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });

  expect(getMockSyncResult(doc.id)?.synced).toBe(true);
  expect(await loadQueue(session)).toEqual([]);
});

test('expired mock credentials refresh before upload', async () => {
  const doc = sample('refresh');
  mockStorage.set(queueKey, JSON.stringify([doc]));
  session.expiresAt = Date.now() - 1;

  await renderHook(() => useDocumentSync(session));

  await waitFor(() => expect(getMockSyncResult(doc.id)?.synced).toBe(true));
  expect(session.accessToken).toBe('mock:demo-worker');
  expect(session.expiresAt).toBeGreaterThan(Date.now());
});

test('a failed upload stays queued with an incremented retry count, then succeeds', async () => {
  const doc = sample('retry');
  mockStorage.set(queueKey, JSON.stringify([doc]));
  jest.spyOn(documents, 'uploadDocument').mockRejectedValueOnce(new Error('Mock upload unavailable'));

  await renderHook(() => useDocumentSync(session));

  await waitFor(async () => expect(await loadQueue(session)).toEqual([{ ...doc, retries: 1 }]));
  expect(getMockSyncResult(doc.id)).toBeUndefined();
  await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
  expect(getMockSyncResult(doc.id)?.synced).toBe(true);
  expect(await loadQueue(session)).toEqual([]);
});

test('unmount removes the sync polling interval', async () => {
  mockConnected = false;
  const fetchNetwork = jest.spyOn(NetInfo, 'fetch');
  const { unmount } = await renderHook(() => useDocumentSync(session));
  await unmount();
  const callsBefore = fetchNetwork.mock.calls.length;
  await act(async () => { await jest.advanceTimersByTimeAsync(60_000); });
  expect(fetchNetwork).toHaveBeenCalledTimes(callsBefore);
});

test('logout aborts old uploads and another account cannot consume its queue', async () => {
  const doc = sample('account');
  mockStorage.set(queueKey, JSON.stringify([doc]));
  let finish = () => {};
  jest.spyOn(documents, 'uploadDocument').mockImplementationOnce((input) => new Promise((resolve) => {
    finish = () => resolve({ documentId: input.idempotencyKey, workerId: input.workerId, uploadedAt: Date.now() });
  }));
  await renderHook(() => useDocumentSync(session));
  await signOut();
  const other = await initializeMockSession('other');
  finish();
  await renderHook(() => useDocumentSync(other));
  expect(session.controller.signal.aborted).toBe(true);
  expect(await loadQueue(other)).toEqual([]);
  await signOut();
  expect(await loadQueue(await initializeMockSession())).toEqual([doc]);
  expect(getMockSyncResult(doc.id)).toBeUndefined();
});

test('enqueue rejects documents owned by another account', async () => {
  mockConnected = false;
  const { result } = await renderHook(() => useDocumentSync(session));
  await expect(result.current.enqueue({ ...sample('foreign'), workerId: 'other' })).rejects.toThrow('owner');
});

test('concurrent enqueues from separate hook instances cannot overwrite each other', async () => {
  mockConnected = false;
  const a = await renderHook(() => useDocumentSync(session));
  const b = await renderHook(() => useDocumentSync(session));
  await act(async () => {
    await Promise.all([a.result.current.enqueue(sample('a')), b.result.current.enqueue(sample('b'))]);
  });
  expect(await loadQueue(session)).toEqual([sample('a'), sample('b')]);
});

test('enqueue during an upload survives the flush snapshot being persisted', async () => {
  mockStorage.set(queueKey, JSON.stringify([sample('slow')]));
  let finish = () => {};
  jest.spyOn(documents, 'uploadDocument').mockImplementationOnce((input) => new Promise((resolve) => {
    finish = () => resolve({ documentId: input.idempotencyKey, workerId: input.workerId, uploadedAt: Date.now() });
  }));
  const { result } = await renderHook(() => useDocumentSync(session));
  mockConnected = false;
  const queued = result.current.enqueue(sample('during'));
  finish();
  await act(async () => { await queued; });
  expect(await loadQueue(session)).toEqual([sample('during')]);
});

test.each([401, 422, 429, 503])('HTTP %s retains the item and classifies the failure', async (status) => {
  const doc = sample(`http-${status}`, 10);
  mockStorage.set(queueKey, JSON.stringify([doc]));
  jest.spyOn(documents, 'uploadDocument').mockRejectedValue(new documents.UploadError(status, 'Server error'));
  const { result } = await renderHook(() => useDocumentSync(session));
  const expected = status === 401 || status === 422
    ? { ...doc, state: 'blocked', error: 'Server error' } : { ...doc, retries: 11 };
  await waitFor(async () => expect(await loadQueue(session)).toEqual([expected]));
  expect(result.current.syncError).toBe('Server error');
});

test('missing files are retained for recapture instead of silently discarded', async () => {
  mockFileExists = false;
  mockStorage.set(queueKey, JSON.stringify([sample('missing')]));
  const { result } = await renderHook(() => useDocumentSync(session));
  await waitFor(() => expect(result.current.syncError).toMatch('recapture'));
  expect((await loadQueue(session))[0].state).toBe('blocked');
});

test('background connectivity failures are reported without unhandled rejections', async () => {
  jest.spyOn(NetInfo, 'fetch').mockRejectedValueOnce(new Error('Network unavailable'));
  const { result } = await renderHook(() => useDocumentSync(session));
  await waitFor(() => expect(result.current.syncError).toBe('Network unavailable'));
});

test.each(['{', '{}', '[null]', JSON.stringify([{ ...sample('bad'), retries: -1 }]),
  JSON.stringify([{ ...sample('bad'), workerId: 'foreign' }])])('invalid stored queue is preserved: %s', async (raw) => {
  mockStorage.set(queueKey, raw);
  const { result } = await renderHook(() => useDocumentSync(session));
  await waitFor(() => expect(result.current.syncError).toMatch('invalid'));
  await expect(result.current.enqueue(sample('new'))).rejects.toThrow('invalid');
  expect(mockStorage.get(queueKey)).toBe(raw);
});

test('large queues use SQLite and SecureStore retains no queue payload', async () => {
  mockConnected = false;
  const queue = Array.from({ length: 100 }, (_, i) => sample(`large-${i}`));
  await persistQueue(session, queue);
  expect(await loadQueue(session)).toEqual(queue);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(queueKey, expect.anything());
});

test('a failed SQLite transaction rolls back without losing the previous queue', async () => {
  await persistQueue(session, [sample('original')]);
  const db = await SQLite.openDatabaseAsync('document-queue.db');
  jest.spyOn(db, 'runAsync').mockRejectedValueOnce(new Error('Disk full'));
  await expect(persistQueue(session, [sample('replacement')])).rejects.toThrow('Disk full');
  expect(await loadQueue(session)).toEqual([sample('original')]);
});

test('missing SQLCipher support fails closed instead of opening a plaintext queue', async () => {
  await jest.isolateModulesAsync(async () => {
    const sqlite = jest.requireMock<typeof import('expo-sqlite')>('expo-sqlite');
    const db = await sqlite.openDatabaseAsync('document-queue.db');
    jest.spyOn(db, 'getFirstAsync').mockResolvedValueOnce(null);
    const auth = jest.requireActual<typeof import('@/api/auth')>('@/api/auth');
    const store = jest.requireActual<typeof import('@/db/queue-store')>('@/db/queue-store');
    await expect(store.loadQueue(await auth.initializeMockSession())).rejects.toThrow('SQLCipher');
  });
});

test('local confirmation failures retry reconciliation without another upload, even after remount', async () => {
  mockStorage.set(queueKey, JSON.stringify([sample('ack')]));
  const upload = jest.spyOn(documents, 'uploadDocument');
  jest.spyOn(db, 'runAsync').mockRejectedValueOnce(new Error('Local database unavailable'));
  const hook = await renderHook(() => useDocumentSync(session));
  await waitFor(() => expect(hook.result.current.syncError).toMatch('Local database'));
  expect((await loadQueue(session))[0].state).toBe('uploaded');
  await hook.unmount();
  mockFileExists = false;
  await renderHook(() => useDocumentSync(session));
  await waitFor(() => expect(getMockSyncResult('ack')?.synced).toBe(true));
  expect(upload).toHaveBeenCalledTimes(1);
});
