import type { QueuedDocument } from '@/queue';

// In-memory mock: confirmation records disappear on reload.
const syncedDocuments = new Map<string, { synced: true; syncedAt: number }>();
export async function confirmDocument(doc: Extract<QueuedDocument, { state: 'uploaded' }>) {
  if (!__DEV__) throw new Error('Mock database is development-only');
  syncedDocuments.set(JSON.stringify([doc.workerId, doc.id]), { synced: true, syncedAt: doc.acknowledgedAt });
}
export function getMockSyncResult(localId: string, workerId = 'demo-worker') {
  if (!__DEV__) throw new Error('Mock database is development-only');
  return syncedDocuments.get(JSON.stringify([workerId, localId]));
}
