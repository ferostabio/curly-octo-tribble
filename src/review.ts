import { useCallback, useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { loadQueue, persistQueue } from '@/db/queue-store';
import { db } from '@/db/client';
import { uploadDocument, UploadError } from '@/api/documents';
import { assertSession, refreshAccessToken, type Session } from '@/api/auth';
import { createSerialExecutor } from '@/serial';
import type { DocumentInput } from '@/queue';

const serialize = createSerialExecutor();
async function getValidToken(session: Session) {
  assertSession(session);
  if (Date.now() >= session.expiresAt) {
    const refreshed = await refreshAccessToken(session);
    assertSession(session);
    Object.assign(session, refreshed);
  }
  return session.accessToken;
}
async function flushQueue(session: Session) {
  assertSession(session);
  if (!(await NetInfo.fetch()).isConnected) return null;
  const queue = await loadQueue(session);
  let failure: string | null = null;
  for (let index = 0; index < queue.length; index++) {
    let doc = queue[index];
    if (doc.state === 'blocked') { failure = doc.error; continue; }
    if (doc.state === 'pending') {
      try {
        const token = await getValidToken(session);
        if (!new File(doc.localUri).exists) throw new UploadError(422, 'Local file missing; recapture required');
        const ack = await uploadDocument({
          uri: doc.localUri, workerId: doc.workerId, idempotencyKey: doc.id,
          token, signal: session.controller.signal,
        });
        assertSession(session);
        if (ack.documentId !== doc.id || ack.workerId !== doc.workerId || !Number.isFinite(ack.uploadedAt)) {
          throw new UploadError(502, 'Invalid server acknowledgement');
        }
        doc = { ...doc, state: 'uploaded', acknowledgedAt: ack.uploadedAt };
      } catch (error: unknown) {
        assertSession(session);
        failure = error instanceof Error ? error.message : 'Upload failed';
        const blocked = error instanceof UploadError && error.status < 500 && ![408, 429].includes(error.status);
        queue[index] = blocked ? { ...doc, state: 'blocked', error: failure } : { ...doc, retries: doc.retries + 1 };
        await persistQueue(session, queue);
        continue;
      }
      queue[index] = doc;
      await persistQueue(session, queue);
    }
    try {
      assertSession(session);
      const result = await db.runAsync(
        'UPDATE documents SET synced = 1, synced_at = ? WHERE local_id = ? AND worker_id = ?',
        [doc.acknowledgedAt, doc.id, session.workerId],
      );
      if (result.changes !== 1) throw new Error('Local confirmation missing');
    } catch (error: unknown) {
      assertSession(session);
      failure = error instanceof Error ? error.message : 'Local confirmation failed';
      continue;
    }
    assertSession(session);
    queue.splice(index--, 1);
    await persistQueue(session, queue);
  }
  return failure;
}

export function useDocumentSync(session: Session) {
  const [syncError, setSyncError] = useState<string | null>(null);
  const mounted = useRef(true);
  const sync = useCallback(async () => {
    try {
      const error = await serialize(() => flushQueue(session));
      if (mounted.current) setSyncError(error);
    } catch (error: unknown) {
      if (mounted.current && !session.controller.signal.aborted) {
        setSyncError(error instanceof Error ? error.message : 'Sync unavailable');
      }
    }
  }, [session]);
  const enqueue = useCallback(async (doc: DocumentInput) => {
    await serialize(async () => {
      assertSession(session);
      if (doc.workerId !== session.workerId) throw new Error('Document owner mismatch');
      const queue = await loadQueue(session);
      if (queue.some((d) => d.checksum === doc.checksum)) return;
      queue.push({ ...doc, retries: 0, state: 'pending' });
      await persistQueue(session, queue);
    });
    await sync();
  }, [session, sync]);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => { if (mounted.current) return sync(); });
    const timer = setInterval(() => { void sync(); }, 30_000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [sync]);
  return { enqueue, sync, syncError };
}
