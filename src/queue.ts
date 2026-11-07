export type DocumentInput = { id: string; localUri: string; workerId: string; checksum: string };
export type QueuedDocument = DocumentInput & { retries: number } & (
  | { state: 'pending' }
  | { state: 'uploaded'; acknowledgedAt: number }
  | { state: 'blocked'; error: string }
);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isDocument(value: unknown): value is QueuedDocument {
  return isRecord(value) && ['id', 'workerId', 'localUri', 'checksum'].every(
    (key) => typeof value[key] === 'string' && value[key] !== '',
  ) && typeof value.retries === 'number' && Number.isSafeInteger(value.retries) && value.retries >= 0 && (
    value.state === 'pending' ||
    (value.state === 'blocked' && typeof value.error === 'string') ||
    (value.state === 'uploaded' && typeof value.acknowledgedAt === 'number' && Number.isFinite(value.acknowledgedAt))
  );
}
export function decodeQueue(raw: string, workerId: string): QueuedDocument[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error();
    return value.map((item: unknown) => {
      if (isRecord(item) && item.state === undefined) item = { ...item, state: 'pending' };
      if (!isDocument(item) || item.workerId !== workerId) throw new Error();
      return item;
    });
  } catch { throw new Error('Stored queue is invalid; original data retained'); }
}
