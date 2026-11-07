import * as SecureStore from 'expo-secure-store';
import { createSerialExecutor } from '@/serial';

export type Session = { workerId: string; controller: AbortController; accessToken: string; expiresAt: number };
const serialize = createSerialExecutor();
let active: Session | undefined;
let generation = 0;
export function assertSession(session: Session) {
  if (active !== session || session.controller.signal.aborted) throw new Error('Session ended');
}
export async function getAccessToken(session: Session) {
  assertSession(session);
  if (Date.now() >= session.expiresAt) {
    await Promise.resolve(); // Mock token refresh boundary.
    assertSession(session);
    session.expiresAt = Date.now() + 3_600_000;
  }
  return session.accessToken;
}
export function initializeMockSession(workerId = 'demo-worker'): Promise<Session> {
  const version = generation;
  return serialize(async () => {
    if (!__DEV__) throw new Error('Mock authentication is development-only');
    if (version !== generation) throw new Error('Session ended');
    if (active) {
      if (active.workerId !== workerId) throw new Error('Sign out before switching accounts');
      return active;
    }
    const session = { workerId, controller: new AbortController(),
      accessToken: `mock:${workerId}`, expiresAt: Date.now() + 3_600_000 };
    active = session;
    try {
      const token = await SecureStore.getItemAsync('access_token');
      assertSession(session);
      if (token && token !== `mock:${workerId}`) throw new Error('A session already exists');
      await SecureStore.setItemAsync('access_token', `mock:${workerId}`);
      assertSession(session);
      return session;
    } catch (error) {
      session.controller.abort();
      if (active === session) active = undefined;
      throw error;
    }
  });
}
export async function signOut() {
  active?.controller.abort();
  active = undefined;
  generation++;
  await serialize(() => SecureStore.deleteItemAsync('access_token'));
}
