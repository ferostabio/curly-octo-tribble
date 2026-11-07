import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';

import * as documents from '@/api/documents';
import { getMockSyncResult } from '@/db/client';
import { useDocumentSync } from '@/review';

const mockStorage = new Map<string, string>();
let mockConnected = true;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ isConnected: mockConnected })) },
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ exists: true })),
}));

function sample(id: string, retries = 0) {
  return { id, localUri: `file:///mock/${id}.txt`, workerId: 'demo-worker', checksum: id, retries };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockStorage.clear();
  mockConnected = true;
  mockStorage.set('access_token', 'mock-bowery-access-token');
  mockStorage.set('token_expiry', String(Date.now() + 60_000));
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('mount runs review.ts, uploads queued data, records sync, and empties the queue', async () => {
  const doc = sample('success');
  mockStorage.set('pending_document_queue', JSON.stringify([doc]));
  const upload = jest.spyOn(documents, 'uploadDocument');

  await renderHook(() => useDocumentSync());

  await waitFor(() => expect(getMockSyncResult(doc.id)?.synced).toBe(true));
  expect(upload).toHaveBeenCalledWith({
    uri: doc.localUri, workerId: doc.workerId, idempotencyKey: doc.id,
    token: 'mock-bowery-access-token',
  });
  await waitFor(() => expect(mockStorage.get('pending_document_queue')).toBe('[]'));
});

test('offline enqueue persists a document and ignores a duplicate checksum', async () => {
  mockConnected = false;
  const upload = jest.spyOn(documents, 'uploadDocument');
  const { result } = await renderHook(() => useDocumentSync());
  const doc = sample('offline');

  await act(async () => { await result.current.enqueue(doc); });
  await act(async () => { await result.current.enqueue({ ...doc, id: 'duplicate' }); });

  expect(mockStorage.get('pending_document_queue')).toBe(JSON.stringify([doc]));
  expect(upload).not.toHaveBeenCalled();
});

test('a queued document syncs on the next polling interval after reconnecting', async () => {
  mockConnected = false;
  const doc = sample('reconnect');
  mockStorage.set('pending_document_queue', JSON.stringify([doc]));
  await renderHook(() => useDocumentSync());
  expect(getMockSyncResult(doc.id)).toBeUndefined();

  mockConnected = true;
  await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });

  expect(getMockSyncResult(doc.id)?.synced).toBe(true);
  expect(mockStorage.get('pending_document_queue')).toBe('[]');
});

test('expired mock credentials refresh before upload', async () => {
  const doc = sample('refresh');
  mockStorage.set('pending_document_queue', JSON.stringify([doc]));
  mockStorage.set('access_token', 'expired-token');
  mockStorage.set('token_expiry', String(Date.now() - 1));

  await renderHook(() => useDocumentSync());

  await waitFor(() => expect(getMockSyncResult(doc.id)?.synced).toBe(true));
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('access_token', 'mock-bowery-access-token');
  expect(Number(mockStorage.get('token_expiry'))).toBeGreaterThan(Date.now());
});

test('a failed upload stays queued with an incremented retry count, then succeeds', async () => {
  const doc = sample('retry');
  mockStorage.set('pending_document_queue', JSON.stringify([doc]));
  jest.spyOn(documents, 'uploadDocument').mockRejectedValueOnce(new Error('Mock upload unavailable'));

  await renderHook(() => useDocumentSync());

  await waitFor(() => expect(mockStorage.get('pending_document_queue')).toBe(
    JSON.stringify([{ ...doc, retries: 1 }]),
  ));
  expect(getMockSyncResult(doc.id)).toBeUndefined();
  await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
  expect(getMockSyncResult(doc.id)?.synced).toBe(true);
  expect(mockStorage.get('pending_document_queue')).toBe('[]');
});

test('unmount removes the sync polling interval', async () => {
  mockConnected = false;
  const fetchNetwork = jest.spyOn(NetInfo, 'fetch');
  const { unmount } = await renderHook(() => useDocumentSync());
  await unmount();
  const callsBefore = fetchNetwork.mock.calls.length;
  await act(async () => { await jest.advanceTimersByTimeAsync(60_000); });
  expect(fetchNetwork).toHaveBeenCalledTimes(callsBefore);
});
