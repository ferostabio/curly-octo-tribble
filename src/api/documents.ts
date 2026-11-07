export class UploadError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

type UploadDocumentInput = {
  uri: string;
  workerId: string;
  idempotencyKey: string;
  token: string;
  signal: AbortSignal;
};

// In-memory mock: no network requests or durable document storage.
const uploads = new Map<string, { uri: string; workerId: string; uploadedAt: number }>();

export async function uploadDocument(input: UploadDocumentInput): Promise<{ documentId: string; workerId: string; uploadedAt: number }> {
  if (!__DEV__) throw new Error('Mock uploads are development-only');
  if (input.token !== `mock:${input.workerId}`) {
    throw new UploadError(401, 'Session expired');
  }

  input.signal.throwIfAborted();
  await Promise.resolve();
  input.signal.throwIfAborted();
  const key = JSON.stringify([input.workerId, input.idempotencyKey]);
  const existing = uploads.get(key);
  if (existing) {
    if (existing.uri !== input.uri || existing.workerId !== input.workerId) {
      throw new UploadError(422, 'Idempotency key already belongs to another document');
    }
    return { documentId: input.idempotencyKey, workerId: input.workerId, uploadedAt: existing.uploadedAt };
  }

  const uploadedAt = Date.now();
  uploads.set(key, { uri: input.uri, workerId: input.workerId, uploadedAt });
  return { documentId: input.idempotencyKey, workerId: input.workerId, uploadedAt };
}
