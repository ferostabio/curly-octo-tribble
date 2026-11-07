type UploadDocumentInput = {
  uri: string;
  workerId: string;
  idempotencyKey: string;
  token: string;
};

// In-memory mock: no network requests or durable document storage.
const uploads = new Map<string, { uri: string; workerId: string }>();

export async function uploadDocument(input: UploadDocumentInput): Promise<void> {
  if (!__DEV__) throw new Error('Mock uploads are development-only');
  if (input.token !== 'mock-bowery-access-token') {
    throw new Error('Initialize a mock session before uploading');
  }

  const existing = uploads.get(input.idempotencyKey);
  if (existing) {
    if (existing.uri !== input.uri || existing.workerId !== input.workerId) {
      throw new Error('Idempotency key already belongs to another document');
    }
    return;
  }

  uploads.set(input.idempotencyKey, { uri: input.uri, workerId: input.workerId });
}
