export class UploadError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

type UploadDocumentInput = {
  uri: string;
  workerId: string;
  checksum: string;
  idempotencyKey: string;
  token: string;
  signal: AbortSignal;
};

// In-memory mock: no network requests or durable document storage.
const uploads = new Map<string, { checksum: string; uploadedAt: number }>();

export async function uploadDocument(input: UploadDocumentInput): Promise<{ documentId: string; workerId: string; checksum: string; uploadedAt: number }> {
  if (!__DEV__) throw new Error('Mock uploads are development-only');
  if (input.token !== `mock:${input.workerId}`) {
    throw new UploadError(401, 'Session expired');
  }

  input.signal.throwIfAborted();
  await Promise.resolve();
  input.signal.throwIfAborted();
  const key = JSON.stringify([input.workerId, input.idempotencyKey]);
  const upload = uploads.get(key) ?? { checksum: input.checksum, uploadedAt: Date.now() };
  if (upload.checksum !== input.checksum) {
    throw new UploadError(422, 'Idempotency key already belongs to another document');
  }
  uploads.set(key, upload);
  return { documentId: input.idempotencyKey, workerId: input.workerId, checksum: input.checksum, uploadedAt: upload.uploadedAt };
}
