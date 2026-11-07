import { File, Paths } from 'expo-file-system';
import { useState } from 'react';
import { Button, ScrollView, Text } from 'react-native';
import { initializeMockSession, type Session } from '@/api/auth';
import { useDocumentSync } from '@/review';

export function DocumentSyncDemo() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  async function start() {
    try { setSession(await initializeMockSession()); }
    catch (error) { setError(String(error)); }
  }
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: 'white' }}
      contentContainerStyle={{ padding: 24, gap: 20 }}>
      <Text role="heading">Document sync demo — synthetic files only</Text>
      {__DEV__ && (session ? <SyncControls session={session} /> :
        <Button title="Initialize mock session" onPress={start} />)}
      {!!error && <Text role="alert">{error}</Text>}
    </ScrollView>
  );
}
function SyncControls({ session }: { session: Session }) {
  const { enqueue, syncError, pending } = useDocumentSync(session);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function queueSample() {
    setBusy(true);
    try {
      const id = `demo-${Date.now()}`;
      const file = new File(Paths.document, `${id}.txt`);
      file.create();
      file.write('Synthetic document. No personal data.');
      await enqueue({ id, localUri: file.uri, workerId: session.workerId, checksum: id });
      setError('');
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  return <>
    <Button title="Queue sample document" onPress={queueSample} disabled={busy} />
    <Text accessibilityLiveRegion="polite">{pending} pending documents</Text>
    {!!(error || syncError) && <Text role="alert">{error || syncError}</Text>}
  </>;
}
