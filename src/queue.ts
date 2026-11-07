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
