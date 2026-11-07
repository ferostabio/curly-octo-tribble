import { render, screen, userEvent } from '@testing-library/react-native';

import { loadQueue } from '@/db/queue-store';
import { initializeMockSession, signOut } from '@/api/auth';
import { DocumentSyncDemo } from '@/components/document-sync-demo';

const mockStorage = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(async (key: string) => { mockStorage.delete(key); }),
  getItemAsync: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ isConnected: true })) },
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///mock' },
  File: jest.fn().mockImplementation((_directory: string, name: string) => ({
    uri: `file:///mock/${name}`, exists: true, create: jest.fn(), write: jest.fn(),
  })),
}));

beforeEach(async () => {
  await signOut();
  jest.useFakeTimers();
  mockStorage.clear();
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
  mockStorage.set('access_token', 'existing-session');
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await render(<DocumentSyncDemo />);
  await user.press(screen.getByRole('button', { name: 'Initialize mock session' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('A session already exists');
  expect(mockStorage.get('access_token')).toBe('existing-session');
  expect(screen.queryByRole('button', { name: 'Queue sample document' })).not.toBeOnTheScreen();
});

test('can reopen the demo with its existing mock session', async () => {
  mockStorage.set('access_token', 'mock:demo-worker');
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await render(<DocumentSyncDemo />);
  await user.press(screen.getByRole('button', { name: 'Initialize mock session' }));

  expect(await screen.findByRole('button', { name: 'Queue sample document' })).toBeEnabled();
});
