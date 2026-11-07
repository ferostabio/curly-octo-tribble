import { z } from 'zod';

const text = z.string().min(1);
const document = z.object({ id: text, localUri: text, workerId: text, checksum: text });
const queued = document.extend({ retries: z.int().nonnegative() }).and(z.union([
  z.object({ state: z.literal('pending').default('pending') }),
  z.object({ state: z.literal('uploaded'), acknowledgedAt: z.number().nonnegative() }),
  z.object({ state: z.literal('blocked'), error: z.string() }),
]));
export type DocumentInput = z.infer<typeof document>;
export type QueuedDocument = z.infer<typeof queued>;
export function decodeQueue(raw: string, workerId: string): QueuedDocument[] {
  try {
    const queue = z.array(queued).parse(JSON.parse(raw));
    if (queue.some((doc) => doc.workerId !== workerId)) throw new Error();
    return queue;
  } catch { throw new Error('Stored queue is invalid; original data retained'); }
}
