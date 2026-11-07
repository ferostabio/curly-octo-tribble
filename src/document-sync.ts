import { File } from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { enqueueDocument, loadQueue, removeDocument, saveDocument } from '@/db/queue-store';
import { confirmDocument } from '@/db/client';
import { uploadDocument, UploadError } from '@/api/documents';
import { assertSession, refreshAccessToken, type Session } from '@/api/auth';
import { acknowledgeDocument, failDocument, type DocumentInput } from '@/queue';

const sessions = new WeakMap<Session, ReturnType<typeof createDocumentSync>>();
export function getDocumentSync(session: Session) {
  let sync = sessions.get(session);
  if (!sync) { sync = createDocumentSync(session); sessions.set(session, sync); }
  return sync;
}
function createDocumentSync(session: Session) {
  let snapshot: { pendingCount: number; syncError: string | null } = { pendingCount: 0, syncError: null };
  const listeners = new Set<() => void>();
  let running: Promise<void> | undefined;
  let requested = false;

  async function publish(syncError: string | null) {
    const queue = await loadQueue(session);
    snapshot = { pendingCount: queue.length, syncError };
    listeners.forEach((listener) => listener());
  }
  async function flushQueue() {
    if (!(await NetInfo.fetch()).isConnected) return null;
    let failure: string | null = null;
    for (let doc of await loadQueue(session)) {
      if (doc.state === 'blocked') { failure = doc.error; continue; }
      if (doc.state === 'pending') {
        try {
          assertSession(session);
          if (Date.now() >= session.expiresAt) {
            const token = await refreshAccessToken(session);
            assertSession(session);
            Object.assign(session, token);
          }
          if (!new File(doc.localUri).exists) throw new UploadError(422, 'Local file missing; recapture required');
          const ack = await uploadDocument({ uri: doc.localUri, workerId: doc.workerId, checksum: doc.checksum,
            idempotencyKey: doc.id, token: session.accessToken, signal: session.controller.signal });
          assertSession(session);
          doc = acknowledgeDocument(doc, ack);
        } catch (error) {
          assertSession(session);
          failure = error instanceof Error ? error.message : 'Upload failed';
          await saveDocument(session, failDocument(doc, failure, error instanceof UploadError ? error.status : undefined));
          continue;
        }
        await saveDocument(session, doc);
      }
      try {
        assertSession(session);
        await confirmDocument(doc);
        await removeDocument(session, doc.id);
      } catch (error) {
        assertSession(session);
        failure = error instanceof Error ? error.message : 'Local confirmation failed';
      }
    }
    return failure;
  }
  async function drain() {
    do {
      requested = false;
      try { await publish(await flushQueue()); }
      catch (error) {
        if (session.controller.signal.aborted) return;
        snapshot = { ...snapshot, syncError: error instanceof Error ? error.message : 'Sync unavailable' };
        listeners.forEach((listener) => listener());
      }
    } while (requested);
  }
  function sync() {
    requested = true;
    running ??= drain().finally(() => { running = undefined; });
    return running;
  }
  async function enqueue(doc: DocumentInput) {
    await enqueueDocument(session, doc);
    await publish(null);
    void sync();
  }
  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }
  return { enqueue, sync, subscribe, getSnapshot: () => snapshot };
}
