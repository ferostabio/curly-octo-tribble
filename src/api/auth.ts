import * as SecureStore from 'expo-secure-store';
import { createSerialExecutor } from '@/serial';

const serialize = createSerialExecutor();

export type Session = {
  workerId: string;
  accessToken: string;
  expiresAt: number;
  controller: AbortController;
};
let active: Session | undefined;
let ready = Promise.resolve();

export function assertSession(session: Session) {
  if (active !== session || session.controller.signal.aborted) throw new Error('Session ended');
}

export async function refreshAccessToken(session: Session) {
  assertSession(session);
  if (!__DEV__) throw new Error('Mock authentication is development-only');
  return { accessToken: `mock:${session.workerId}`, expiresAt: Date.now() + 3_600_000 };
}

export async function initializeMockSession(workerId = 'demo-worker'): Promise<Session> {
  if (!__DEV__) throw new Error('Mock authentication is development-only');
  if (active) {
    const session = active;
    await ready;
    assertSession(session);
    if (session.workerId !== workerId) throw new Error('Sign out before switching accounts');
    return session;
  }
  const session: Session = {
    workerId, accessToken: `mock:${workerId}`, expiresAt: Date.now() + 3_600_000,
    controller: new AbortController(),
  };
  active = session;
  try {
    ready = serialize(async () => {
      const token = await SecureStore.getItemAsync('access_token');
      assertSession(session);
      if (token && token !== session.accessToken) throw new Error('A session already exists');
      await SecureStore.setItemAsync('access_token', session.accessToken);
      assertSession(session);
    });
    await ready;
    assertSession(session);
    return session;
  } catch (error) {
    session.controller.abort();
    if (active === session) active = undefined;
    throw error;
  }
}

export async function signOut() {
  active?.controller.abort();
  active = undefined;
  await serialize(() => SecureStore.deleteItemAsync('access_token'));
}
