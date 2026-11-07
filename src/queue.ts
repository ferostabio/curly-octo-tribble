export type DocumentInput = {
  id: string;
  localUri: string;
  workerId: string;
  checksum: string;
};
export type QueuedDocument = DocumentInput & { retries: number } & (
  | { state: 'pending' }
  | { state: 'blocked'; error: string }
);

function parseDocument(value: unknown): QueuedDocument {
  if (typeof value !== 'object' || value === null ||
    !('id' in value) || typeof value.id !== 'string' || !value.id ||
    !('workerId' in value) || typeof value.workerId !== 'string' || !value.workerId ||
    !('localUri' in value) || typeof value.localUri !== 'string' || !value.localUri ||
    !('checksum' in value) || typeof value.checksum !== 'string' || !value.checksum ||
    !('retries' in value) || typeof value.retries !== 'number' ||
    !Number.isSafeInteger(value.retries) || value.retries < 0) throw new Error('Invalid document');
  const base = { id: value.id, workerId: value.workerId, localUri: value.localUri,
    checksum: value.checksum, retries: value.retries };
  if (!('state' in value) || value.state === 'pending') return { ...base, state: 'pending' };
  if (value.state === 'blocked' && 'error' in value && typeof value.error === 'string') {
    return { ...base, state: 'blocked', error: value.error };
  }
  throw new Error('Invalid state');
}

export function decodeQueue(raw: string, workerId: string): QueuedDocument[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('Expected queue');
    const queue = value.map(parseDocument);
    if (queue.some((doc) => doc.workerId !== workerId)) throw new Error('Owner mismatch');
    return queue;
  } catch {
    throw new Error('Stored queue is invalid; original data retained for recovery');
  }
}
