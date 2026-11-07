import { decodeQueue } from '@/queue';

const document = { id: 'a', localUri: 'file:///a', workerId: 'worker', checksum: 'hash', retries: 0 };

test('legacy records default to pending; uploaded and blocked states survive decoding', () => {
  const records = [document, { ...document, state: 'uploaded', acknowledgedAt: 123 },
    { ...document, state: 'blocked', error: 'Recapture required' }];
  expect(decodeQueue(JSON.stringify(records), 'worker')).toEqual([
    { ...document, state: 'pending' }, records[1], records[2],
  ]);
});

test.each([
  { retries: 0.5 },
  { state: 'uploaded', acknowledgedAt: '123' },
  { state: 'unknown' },
])('rejects invalid persisted fields: %j', (fields) => {
  expect(() => decodeQueue(JSON.stringify([{ ...document, ...fields }]), 'worker')).toThrow('original data retained');
});
