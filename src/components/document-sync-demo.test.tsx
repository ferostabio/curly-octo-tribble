import * as SecureStore from 'expo-secure-store';
import { render, screen, userEvent } from '@testing-library/react-native';

import { loadQueue } from '@/db/queue-store';
import { initializeMockSession, signOut } from '@/api/auth';
import { DocumentSyncDemo } from '@/components/document-sync-demo';

beforeEach(async () => {
  await signOut();
  jest.useFakeTimers();
});

afterEach(() => { jest.useRealTimers(); });

test('initializes a session, mounts the real sync hook, and reports the mock upload', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await render(<DocumentSyncDemo />);
  await user.press(screen.getByRole('button', { name: 'Initialize mock session' }));
  await user.press(screen.getByRole('button', { name: 'Queue sample document' }));

  expect(await screen.findByText('Synced: mock upload and database update completed.')).toBeOnTheScreen();
  expect(await loadQueue(await initializeMockSession())).toEqual([]);
});

test('refuses to replace an existing non-mock session', async () => {
  await SecureStore.setItemAsync('access_token', 'existing-session');
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await render(<DocumentSyncDemo />);
  await user.press(screen.getByRole('button', { name: 'Initialize mock session' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('A session already exists');
  expect(await SecureStore.getItemAsync('access_token')).toBe('existing-session');
  expect(screen.queryByRole('button', { name: 'Queue sample document' })).not.toBeOnTheScreen();
});

test('can reopen the demo with its existing mock session', async () => {
  await SecureStore.setItemAsync('access_token', 'mock:demo-worker');
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await render(<DocumentSyncDemo />);
  await user.press(screen.getByRole('button', { name: 'Initialize mock session' }));

  expect(await screen.findByRole('button', { name: 'Queue sample document' })).toBeEnabled();
});
