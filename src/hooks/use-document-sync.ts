import { useEffect, useSyncExternalStore } from 'react';
import type { Session } from '@/api/auth';
import { getDocumentSync } from '@/document-sync';

export function useDocumentSync(session: Session) {
  const sync = getDocumentSync(session);
  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  useEffect(() => {
    void sync.sync();
    const timer = setInterval(() => { void sync.sync(); }, 30_000);
    return () => clearInterval(timer);
  }, [sync]);
  return { enqueue: sync.enqueue, sync: sync.sync, ...snapshot };
}
