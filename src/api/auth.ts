import * as SecureStore from 'expo-secure-store';

// Local development mock; these tokens are never sent to a server.
export async function refreshAccessToken() {
  if (!__DEV__) throw new Error('Mock authentication is development-only');

  return {
    accessToken: 'mock-bowery-access-token',
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
}

// Call explicitly before exercising document sync; do not replace a real session.
export async function initializeMockSession(): Promise<void> {
  const session = await refreshAccessToken();
  const existingToken = await SecureStore.getItemAsync('access_token');
  if (existingToken && existingToken !== session.accessToken) {
    throw new Error('A session already exists');
  }

  await SecureStore.setItemAsync('access_token', session.accessToken);
  await SecureStore.setItemAsync('token_expiry', String(session.expiresAt));
}
