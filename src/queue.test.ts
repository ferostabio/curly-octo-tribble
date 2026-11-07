import { acknowledgeDocument, decodeQueue, failDocument } from '@/queue';

const document = { id: 'a', localUri: 'file:///a', workerId: 'worker', checksum: 'hash', retries: 0, state: 'pending' as const };

test('all queue states survive decoding', () => {
  const records = [document, { ...document, state: 'uploaded', acknowledgedAt: 123 },
    { ...document, state: 'blocked', error: 'Recapture required' }];
  expect(decodeQueue(JSON.stringify(records), 'worker')).toEqual(records);
});

test.each([{ retries: 0.5 }, { state: 'uploaded', acknowledgedAt: '123' }, { state: 'unknown' },
  { state: undefined }, { workerId: 'foreign' }])('rejects invalid stored fields: %j', (fields) => {
  expect(() => decodeQueue(JSON.stringify([{ ...document, ...fields }]), 'worker')).toThrow('original data retained');
});

test.each([{ documentId: 'other' }, { workerId: 'other' }, { checksum: 'other' }, { uploadedAt: -1 },
  { uploadedAt: Infinity }])('rejects invalid acknowledgements without changing the document: %j', (fields) => {
  expect(() => acknowledgeDocument(document, {
    documentId: document.id, workerId: document.workerId, checksum: document.checksum, uploadedAt: 123, ...fields,
  })).toThrow('Invalid server acknowledgement');
  expect(document.state).toBe('pending');
});

test('successful acknowledgements and retry decisions are pure transitions', () => {
  expect(acknowledgeDocument(document, { documentId: 'a', workerId: 'worker', checksum: 'hash', uploadedAt: 123 }))
    .toMatchObject({ state: 'uploaded', acknowledgedAt: 123 });
  expect(failDocument(document, 'Busy', 429)).toMatchObject({ state: 'pending', retries: 1 });
  expect(failDocument(document, 'Invalid', 422)).toMatchObject({ state: 'blocked', error: 'Invalid' });
  expect(document.retries).toBe(0);
});
