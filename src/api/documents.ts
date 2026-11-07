import type { DocumentInput } from '@/queue';
export class UploadError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
type Receipt = Pick<DocumentInput, 'id' | 'workerId' | 'checksum'> & { uploadedAt: number };
const uploads = new Map<string, Receipt>();
export async function uploadDocument(input: DocumentInput & { token: string; signal: AbortSignal }): Promise<Receipt> {
  if (!__DEV__) throw new Error('Mock uploads are development-only');
  if (input.token !== `mock:${input.workerId}`) throw new UploadError(401, 'Session expired');
  input.signal.throwIfAborted();
  await Promise.resolve();
  input.signal.throwIfAborted();
  const key = JSON.stringify([input.workerId, input.id]);
  const previous = uploads.get(key);
  if (previous && previous.checksum !== input.checksum) throw new UploadError(422, 'Document identity conflict');
  const receipt = previous ?? { id: input.id, workerId: input.workerId, checksum: input.checksum, uploadedAt: Date.now() };
  uploads.set(key, receipt);
  return receipt;
}
