import { useCallback, useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { loadQueue, saveDocument, removeDocument } from '@/db/queue-store';
import { db } from '@/db/client';
import { uploadDocument, UploadError } from '@/api/documents';
import { assertSession, getAccessToken, type Session } from '@/api/auth';
import { createSerialExecutor } from '@/serial';
import type { DocumentInput } from '@/queue';

const serialize = createSerialExecutor();
async function flushQueue(session: Session) {
  assertSession(session);
  const queue = await loadQueue(session);
  const online = (await NetInfo.fetch()).isConnected;
  let failure: string | null = null;
  for (let doc of queue) {
    if (doc.state === 'blocked') { failure = doc.error; continue; }
    if (doc.state === 'pending' && !online) continue;
    try {
      if (doc.state === 'pending') {
        const token = await getAccessToken(session);
        if (!new File(doc.localUri).exists) throw new UploadError(422, 'Missing file; recapture required');
        const ack = await uploadDocument({ ...doc, token, signal: session.controller.signal });
        assertSession(session);
        if (ack.id !== doc.id || ack.workerId !== doc.workerId || ack.checksum !== doc.checksum || !Number.isFinite(ack.uploadedAt)) {
          throw new UploadError(502, 'Invalid acknowledgement');
        }
        doc = { ...doc, state: 'uploaded', acknowledgedAt: ack.uploadedAt };
        await saveDocument(session, doc);
      }
      assertSession(session);
      await db.confirm(session.workerId, doc.id, doc.acknowledgedAt);
      assertSession(session);
      await removeDocument(session, doc.id);
    } catch (error) {
      assertSession(session);
      failure = String(error);
      if (doc.state === 'pending') {
        const blocked = error instanceof UploadError && error.status < 500 && ![408, 429].includes(error.status);
        await saveDocument(session, blocked ? { ...doc, state: 'blocked', error: failure } : { ...doc, retries: doc.retries + 1 });
      }
    }
  }
  return { syncError: failure ?? '', pending: (await loadQueue(session)).length };
}

export function syncDocuments(session: Session) {
  return serialize(() => flushQueue(session));
}
export function enqueueDocument(session: Session, doc: DocumentInput) {
  return serialize(async () => {
    assertSession(session);
    if (doc.workerId !== session.workerId) throw new Error('Document owner mismatch');
    const queue = await loadQueue(session);
    const existing = queue.find((item) => item.id === doc.id && item.workerId === doc.workerId);
    if (existing) {
      if (existing.checksum !== doc.checksum) throw new Error('Document content changed; use a new document ID');
      return;
    }
    await saveDocument(session, { ...doc, retries: 0, state: 'pending' });
  });
}
export function useDocumentSync(session: Session) {
  const [result, setResult] = useState({ syncError: '', pending: 0 });
  const mounted = useRef(true);
  const sync = useCallback(async () => {
    try {
      const result = await syncDocuments(session);
      if (mounted.current) setResult(result);
    } catch (error) {
      if (mounted.current && !session.controller.signal.aborted) {
        setResult((previous) => ({ ...previous, syncError: String(error) }));
      }
    }
  }, [session]);
  const enqueue = useCallback(async (doc: DocumentInput) => {
    await enqueueDocument(session, doc);
    await sync();
  }, [session, sync]);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => { if (mounted.current) return sync(); });
    const timer = setInterval(() => { void sync(); }, 30_000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [sync]);
  return { enqueue, ...result };
}
