import { uploadDocument } from '@/api/documents';

function input(workerId: string) {
  return { workerId, id: 'same-id', checksum: 'same-content',
    localUri: 'file:///original', token: `mock:${workerId}`, signal: new AbortController().signal };
}

test('idempotent retries bind content to worker and document ID, regardless of file path', async () => {
  const doc = input('alice');
  const ack = await uploadDocument(doc);
  expect(await uploadDocument({ ...doc, localUri: 'file:///moved' })).toEqual(ack);
  await expect(uploadDocument({ ...doc, checksum: 'changed' })).rejects.toMatchObject({ status: 422 });
  expect(await uploadDocument(input('bob'))).toMatchObject({ workerId: 'bob' });
  await expect(uploadDocument({ ...doc, token: 'mock:bob' })).rejects.toMatchObject({ status: 401 });
});
