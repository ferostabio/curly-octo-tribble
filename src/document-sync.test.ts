import { File } from 'expo-file-system';
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import { enqueueDocument, loadQueue, saveDocument } from '@/db/queue-store';
import * as documents from '@/api/documents';
import * as confirmation from '@/db/client';
import { initializeMockSession, signOut, type Session } from '@/api/auth';
import { getDocumentSync } from '@/document-sync';

let session: Session;
function sample(id: string) {
  return { id, localUri: `file:///mock/${id}.txt`, workerId: 'demo-worker', checksum: id };
}
async function seed(id: string) { await enqueueDocument(session, sample(id)); }
function offline() { jest.mocked(NetInfo.fetch).mockResolvedValue({ type: NetInfoStateType.none, isConnected: false, isInternetReachable: false, details: null }); }
beforeEach(async () => { await signOut(); session = await initializeMockSession(); });

test('sync uploads, confirms, publishes completion, and empties the queue', async () => {
  const sync = getDocumentSync(session);
  const listener = jest.fn();
  const unsubscribe = sync.subscribe(listener);
  await sync.enqueue(sample('success'));
  await sync.sync();
  expect(confirmation.getMockSyncResult('success')?.synced).toBe(true);
  expect(await loadQueue(session)).toEqual([]);
  expect(sync.getSnapshot()).toEqual({ pendingCount: 0, syncError: null });
  expect(listener).toHaveBeenCalled();
  unsubscribe();
});

test('offline concurrent enqueues deduplicate identities, preserve content, and reconnect', async () => {
  offline();
  const sync = getDocumentSync(session);
  await Promise.all([sync.enqueue(sample('a')), getDocumentSync(session).enqueue(sample('b')), sync.enqueue(sample('a'))]);
  await sync.sync();
  expect((await loadQueue(session)).map((doc) => doc.id)).toEqual(['a', 'b']);
  await expect(sync.enqueue({ ...sample('a'), checksum: 'changed' })).rejects.toThrow('new document ID');
  await expect(sync.enqueue({ ...sample('foreign'), workerId: 'other' })).rejects.toThrow('owner');
  jest.mocked(NetInfo.fetch).mockResolvedValue({ type: NetInfoStateType.other, isConnected: true, isInternetReachable: true, details: { isConnectionExpensive: false } });
  await sync.sync();
  expect(await loadQueue(session)).toEqual([]);
});

test('expired credentials refresh before upload', async () => {
  await seed('refresh');
  session.expiresAt = 0;
  await getDocumentSync(session).sync();
  expect(session.expiresAt).toBeGreaterThan(Date.now());
  expect(confirmation.getMockSyncResult('refresh')?.synced).toBe(true);
});

test.each([401, 422, 429, 503, undefined])('upload failure %s retains and classifies the item', async (status) => {
  await seed(`failure-${status}`);
  const error = status ? new documents.UploadError(status, 'Upload failed') : new Error('Upload failed');
  jest.spyOn(documents, 'uploadDocument').mockRejectedValueOnce(error);
  const sync = getDocumentSync(session);
  await sync.sync();
  const blocked = status === 401 || status === 422;
  expect((await loadQueue(session))[0]).toMatchObject({ state: blocked ? 'blocked' : 'pending', retries: blocked ? 0 : 1 });
  expect(sync.getSnapshot().syncError).toBe('Upload failed');
  await sync.sync();
  expect((await loadQueue(session)).length).toBe(blocked ? 1 : 0);
});

test('missing files remain blocked for recapture', async () => {
  await seed('missing');
  const missing = new File('file:///missing');
  Object.defineProperty(missing, 'exists', { value: false });
  jest.mocked(File).mockReturnValueOnce(missing);
  await getDocumentSync(session).sync();
  expect((await loadQueue(session))[0]).toMatchObject({ state: 'blocked', error: expect.stringContaining('recapture') });
});

test('enqueue persists during a stalled upload and the processor drains new work once', async () => {
  await seed('slow');
  const { promise, resolve } = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const upload = jest.spyOn(documents, 'uploadDocument');
  upload.mockImplementationOnce(async (input) => {
    entered.resolve();
    await promise;
    return { documentId: input.idempotencyKey, workerId: input.workerId, checksum: input.checksum, uploadedAt: Date.now() };
  });
  const sync = getDocumentSync(session);
  const running = sync.sync();
  await entered.promise;
  await sync.enqueue(sample('during'));
  expect((await loadQueue(session)).map((doc) => doc.id)).toEqual(['slow', 'during']);
  expect(sync.sync()).toBe(running);
  resolve();
  await running;
  expect(await loadQueue(session)).toEqual([]);
  expect(upload).toHaveBeenCalledTimes(2);
});

test('logout stops old reconciliation; another account cannot consume its queue', async () => {
  await seed('account');
  const { promise, resolve } = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  jest.spyOn(documents, 'uploadDocument').mockImplementationOnce(async (input) => {
    entered.resolve();
    await promise;
    return { documentId: input.idempotencyKey, workerId: input.workerId, checksum: input.checksum, uploadedAt: Date.now() };
  });
  const running = getDocumentSync(session).sync();
  await entered.promise;
  await signOut();
  const other = await initializeMockSession('other');
  resolve();
  await running;
  expect(session.controller.signal.aborted).toBe(true);
  expect(await loadQueue(other)).toEqual([]);
  await signOut();
  expect((await loadQueue(await initializeMockSession()))[0].id).toBe('account');
  expect(confirmation.getMockSyncResult('account')).toBeUndefined();
});

test('acknowledgements survive a new session and reconciliation does not upload again', async () => {
  await seed('ack');
  const upload = jest.spyOn(documents, 'uploadDocument');
  jest.spyOn(confirmation, 'confirmDocument').mockRejectedValueOnce(new Error('Local database unavailable'));
  await getDocumentSync(session).sync();
  expect((await loadQueue(session))[0].state).toBe('uploaded');
  await signOut();
  session = await initializeMockSession();
  await getDocumentSync(session).sync();
  expect(confirmation.getMockSyncResult('ack')?.synced).toBe(true);
  expect(upload).toHaveBeenCalledTimes(1);
});

test('background connectivity errors are published without rejecting sync', async () => {
  jest.mocked(NetInfo.fetch).mockRejectedValueOnce(new Error('Network unavailable'));
  await getDocumentSync(session).sync();
  expect(getDocumentSync(session).getSnapshot().syncError).toBe('Network unavailable');
});

test('only a valid encryption key is written to SecureStore; row updates are targeted', async () => {
  const storage = jest.spyOn(SecureStore, 'setItemAsync');
  const sqlite = jest.requireMock<{ connections: { runAsync: (...args: unknown[]) => Promise<unknown> }[] }>('expo-sqlite');
  const connection = sqlite.connections[0];
  const writes = jest.spyOn(connection, 'runAsync');
  await Promise.all(Array.from({ length: 100 }, (_, i) => seed(`large-${i}`)));
  await saveDocument(session, { ...sample('large-0'), retries: 1, state: 'pending' });
  expect(await loadQueue(session)).toHaveLength(100);
  expect(writes.mock.calls.filter(([query]) => String(query).startsWith('INSERT'))).toHaveLength(100);
  expect(writes.mock.calls.filter(([query]) => String(query).startsWith('UPDATE'))).toHaveLength(1);
  expect(storage).not.toHaveBeenCalled();
  writes.mockRejectedValueOnce(new Error('Disk full'));
  await expect(seed('disk-full')).rejects.toThrow('Disk full');
  expect(await loadQueue(session)).toHaveLength(100);
});
