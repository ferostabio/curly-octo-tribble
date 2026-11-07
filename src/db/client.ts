// Minimal in-memory adapter for the sync hook's single UPDATE statement.
// Records disappear on reload; this is not a SQL database.
const syncedDocuments = new Map<string, { synced: true; syncedAt: number }>();

async function runAsync(query: string, [syncedAt, localId, workerId]: [number, string, string]) {
  if (!__DEV__) throw new Error('Mock database is development-only');
  if (query !== 'UPDATE documents SET synced = 1, synced_at = ? WHERE local_id = ? AND worker_id = ?') {
    throw new Error('Unsupported query in mock database');
  }

  syncedDocuments.set(JSON.stringify([workerId, localId]), { synced: true, syncedAt });
  return { changes: 1 };
}

export const db = { runAsync };

export function getMockSyncResult(localId: string, workerId = 'demo-worker') {
  if (!__DEV__) throw new Error('Mock database is development-only');
  return syncedDocuments.get(JSON.stringify([workerId, localId]));
}
