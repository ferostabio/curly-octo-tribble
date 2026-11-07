import { useEffect, useRef, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { db } from '@/db/client';
import { uploadDocument } from '@/api/documents';
import { assertSession, refreshAccessToken, type Session } from '@/api/auth';

function queueKey(session: Session) {
  return `pending_document_queue:${encodeURIComponent(session.workerId)}`;
}
const MAX_RETRIES = 3;

type QueuedDocument = {
  id: string;
  localUri: string;
  workerId: string;
  retries: number;
  checksum: string;
};

async function loadQueue(session: Session): Promise<QueuedDocument[]> {
  const raw = await SecureStore.getItemAsync(queueKey(session));
  return raw ? JSON.parse(raw) : [];
}

async function persistQueue(session: Session, queue: QueuedDocument[]): Promise<void> {
  assertSession(session);
  await SecureStore.setItemAsync(queueKey(session), JSON.stringify(queue));
}

async function getValidToken(session: Session): Promise<string> {
  assertSession(session);
  if (Date.now() >= session.expiresAt) {
    const refreshed = await refreshAccessToken(session);
    assertSession(session);
    Object.assign(session, refreshed);
  }
  return session.accessToken;
}

async function flushQueue(session: Session): Promise<void> {
  assertSession(session);
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  const queue = await loadQueue(session);
  const remaining: QueuedDocument[] = [];

  for (const doc of queue) {
    try {
      const token = await getValidToken(session);
      assertSession(session);
      if (doc.workerId !== session.workerId) throw new Error('Queue owner mismatch');
      const file = new File(doc.localUri);
      if (!file.exists) continue;

      await uploadDocument({
        uri: doc.localUri,
        workerId: doc.workerId,
        idempotencyKey: doc.id,
        token,
        signal: session.controller.signal,
      });

      assertSession(session);
      await db.runAsync(
        'UPDATE documents SET synced = 1, synced_at = ? WHERE local_id = ? AND worker_id = ?',
        [Date.now(), doc.id, session.workerId]
      );
    } catch (err: any) {
      assertSession(session);
      if (doc.retries < MAX_RETRIES) {
        remaining.push({ ...doc, retries: doc.retries + 1 });
      } else {
        console.warn(`Dropping document ${doc.id} after ${MAX_RETRIES} retries`, err?.message);
      }
    }
  }

  assertSession(session);
  await persistQueue(session, remaining);
}

export function useDocumentSync(session: Session) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enqueue = useCallback(async (doc: Omit<QueuedDocument, 'retries'>) => {
    assertSession(session);
    if (doc.workerId !== session.workerId) throw new Error('Document owner mismatch');
    const queue = await loadQueue(session);
    const isDuplicate = queue.some((d) => d.checksum === doc.checksum);
    if (isDuplicate) return;
    queue.push({ ...doc, retries: 0 });
    await persistQueue(session, queue);
    void flushQueue(session).catch(() => {});
  }, [session]);

  useEffect(() => {
    void flushQueue(session).catch(() => {});
    intervalRef.current = setInterval(() => { void flushQueue(session).catch(() => {}); }, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session]);

  return { enqueue };
}
