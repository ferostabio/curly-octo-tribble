import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet } from 'react-native';

import { initializeMockSession, type Session } from '@/api/auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getMockSyncResult } from '@/db/client';
import { useDocumentSync } from '@/review';

type SessionState =
  | { kind: 'idle' }
  | { kind: 'initializing' }
  | { kind: 'ready'; session: Session }
  | { kind: 'error'; message: string };

export function DocumentSyncDemo() {
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

  if (!__DEV__) return <ThemedText>Document sync demo is development-only.</ThemedText>;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ThemedText type="title">Document sync demo</ThemedText>
        <ThemedText>
          Runs review.ts with mock authentication, uploads, and database writes.
          Only synthetic files are used. No documents are sent to a server.
        </ThemedText>
        {session.kind === 'ready' ? <SyncControls session={session.session} /> : (
          <Button title="Initialize mock session" onPress={startSession} disabled={session.kind === 'initializing'} />
        )}
        {session.kind === 'error' && <ThemedText role="alert">{session.message}</ThemedText>}
      </ScrollView>
    </ThemedView>
  );
}

function SyncControls({ session }: { session: Session }) {
  const { enqueue } = useDocumentSync(session);
  const [documentId, setDocumentId] = useState<string>();
  const [status, setStatus] = useState('Ready to queue a sample.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!documentId) return;
    const timer = setInterval(() => {
      if (getMockSyncResult(documentId)) {
        setStatus('Synced: mock upload and database update completed.');
        clearInterval(timer);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [documentId]);

  async function queueSample() {
    setBusy(true);
    try {
      const id = `demo-${Date.now()}`;
      const file = new File(Paths.document, `${id}.txt`);
      file.create();
      file.write('Synthetic onboarding document. No personal data.');
      setDocumentId(id);
      await enqueue({ id, localUri: file.uri, workerId: 'demo-worker', checksum: id });
      setStatus('Queued. Waiting for sync; offline uploads retry every 30 seconds while this screen is mounted.');
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Could not queue sample.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button title="Queue sample document" onPress={queueSample} disabled={busy} />
      <ThemedText accessibilityLiveRegion="polite">{status}</ThemedText>
      {documentId && <ThemedText selectable>{documentId}</ThemedText>}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 100, gap: 24 },
});
