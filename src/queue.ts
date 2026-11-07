import { z } from 'zod';

const text = z.string().min(1);
const document = z.object({ id: text, localUri: text, workerId: text, checksum: text });
const queued = document.extend({ retries: z.int().nonnegative() }).and(z.union([
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('uploaded'), acknowledgedAt: z.number().nonnegative() }),
  z.object({ state: z.literal('blocked'), error: z.string() }),
]));
export type DocumentInput = z.infer<typeof document>;
export type QueuedDocument = z.infer<typeof queued>;
const acknowledgement = z.object({ documentId: text, workerId: text, checksum: text, uploadedAt: z.number().nonnegative() });
export function acknowledgeDocument(doc: DocumentInput & { retries: number }, input: unknown): Extract<QueuedDocument, { state: 'uploaded' }> {
  const ack = acknowledgement.safeParse(input);
  if (!ack.success || ack.data.documentId !== doc.id || ack.data.workerId !== doc.workerId || ack.data.checksum !== doc.checksum) {
    throw new Error('Invalid server acknowledgement');
  }
  return { ...doc, state: 'uploaded', acknowledgedAt: ack.data.uploadedAt };
}
export function failDocument(doc: QueuedDocument, error: string, status?: number): QueuedDocument {
  return status !== undefined && status < 500 && ![408, 429].includes(status)
    ? { ...doc, state: 'blocked', error } : { ...doc, retries: doc.retries + 1 };
}
export function decodeQueue(raw: string, workerId: string): QueuedDocument[] {
  try {
    const queue = z.array(queued).parse(JSON.parse(raw));
    if (queue.some((doc) => doc.workerId !== workerId)) throw new Error();
    return queue;
  } catch { throw new Error('Stored queue is invalid; original data retained'); }
}
