import { File, Paths } from 'expo-file-system';
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { initializeMockSession, type Session } from '@/api/auth';
import { useDocumentSync } from '@/use-document-sync';

type SessionState =
  | { kind: 'idle' }
  | { kind: 'initializing' }
  | { kind: 'ready'; session: Session }
  | { kind: 'error'; message: string };

export function DocumentSyncDemo() {
  const dark = useColorScheme() === 'dark';
  const color = dark ? '#fff' : '#000';
  const [session, setSession] = useState<SessionState>({ kind: 'idle' });

  async function startSession() {
    setSession({ kind: 'initializing' });
    try {
      const session = await initializeMockSession();
      setSession({ kind: 'ready', session });
    } catch (error: unknown) {
      setSession({ kind: 'error', message: error instanceof Error ? error.message : 'Session failed' });
    }
  }

  if (!__DEV__) return <Text style={{ color }}>Document sync demo is development-only.</Text>;

  return (
    <View style={[styles.container, { backgroundColor: dark ? '#000' : '#fff' }]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text style={{ color }} role="heading">Document sync demo</Text>
        <Text style={{ color }}>
          Uses mock authentication, uploads, and database writes.
          Only synthetic files are used. No documents are sent to a server.
        </Text>
        {session.kind === 'ready' ? <SyncControls session={session.session} color={color} /> : (
          <Button title="Initialize mock session" onPress={startSession} disabled={session.kind === 'initializing'} />
        )}
        {session.kind === 'error' && <Text style={{ color }} role="alert">{session.message}</Text>}
      </ScrollView>
    </View>
  );
}

function SyncControls({ session, color }: { session: Session; color: string }) {
  const { enqueue, syncError, pendingCount } = useDocumentSync(session);
  const [documentId, setDocumentId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const status = message ?? (!documentId ? 'Ready to queue a sample.' : pendingCount > 0
    ? 'Queued. Waiting for sync; offline uploads retry every 30 seconds while this screen is mounted.'
    : 'Synced: mock upload and database update completed.');

  async function queueSample() {
    setBusy(true);
    setMessage(undefined);
    try {
      const id = `demo-${Date.now()}`;
      const file = new File(Paths.document, `${id}.txt`);
      file.create();
      file.write('Synthetic onboarding document. No personal data.');
      await enqueue({ id, localUri: file.uri, workerId: session.workerId, checksum: id });
      setDocumentId(id);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Could not queue sample.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {syncError && <Text style={{ color }} role="alert">{syncError}</Text>}
      <Button title="Queue sample document" onPress={queueSample} disabled={busy} />
      <Text style={{ color }} accessibilityLiveRegion="polite">{status}</Text>
      {documentId && <Text style={{ color }} selectable>{documentId}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 100, gap: 24 },
});
