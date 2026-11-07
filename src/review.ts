import { useEffect, useRef, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { db } from '@/db/client';
import { uploadDocument } from '@/api/documents';
import { refreshAccessToken } from '@/api/auth';

const QUEUE_KEY = 'pending_document_queue';
const MAX_RETRIES = 3;

type QueuedDocument = {
  id: string;
  localUri: string;
  workerId: string;
  retries: number;
  checksum: string;
};

async function loadQueue(): Promise<QueuedDocument[]> {
  const raw = await SecureStore.getItemAsync(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function persistQueue(queue: QueuedDocument[]): Promise<void> {
  await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue));
}

async function getValidToken(): Promise<string> {
  const token = await SecureStore.getItemAsync('access_token');
  const expiry = await SecureStore.getItemAsync('token_expiry');
  if (!token || !expiry) throw new Error('No session');
  if (Date.now() >= parseInt(expiry, 10)) {
    const refreshed = await refreshAccessToken();
    await SecureStore.setItemAsync('access_token', refreshed.accessToken);
    await SecureStore.setItemAsync('token_expiry', String(refreshed.expiresAt));
    return refreshed.accessToken;
  }
  return token;
}

async function flushQueue(): Promise<void> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  const queue = await loadQueue();
  const remaining: QueuedDocument[] = [];

  for (const doc of queue) {
    try {
      const token = await getValidToken();
      const file = new File(doc.localUri);
      if (!file.exists) continue;

      await uploadDocument({
        uri: doc.localUri,
        workerId: doc.workerId,
        idempotencyKey: doc.id,
        token,
      });

      await db.runAsync(
        'UPDATE documents SET synced = 1, synced_at = ? WHERE local_id = ?',
        [Date.now(), doc.id]
      );
    } catch (err: any) {
      if (doc.retries < MAX_RETRIES) {
        remaining.push({ ...doc, retries: doc.retries + 1 });
      } else {
        console.warn(`Dropping document ${doc.id} after ${MAX_RETRIES} retries`, err?.message);
      }
    }
  }

  await persistQueue(remaining);
}

export function useDocumentSync() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enqueue = useCallback(async (doc: Omit<QueuedDocument, 'retries'>) => {
    const queue = await loadQueue();
    const isDuplicate = queue.some((d) => d.checksum === doc.checksum);
    if (isDuplicate) return;
    queue.push({ ...doc, retries: 0 });
    await persistQueue(queue);
    flushQueue();
  }, []);

  useEffect(() => {
    flushQueue();
    intervalRef.current = setInterval(flushQueue, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { enqueue };
}
