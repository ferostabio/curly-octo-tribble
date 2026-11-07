jest.mock('expo-sqlite', () => require('./sqlite-mock.cjs'));
jest.mock('expo-crypto', () => ({ getRandomBytesAsync: async () => new Uint8Array(32) }));
// Keep SecureStore's real JS validation; replace only its native implementation.
jest.mock('expo-secure-store/build/ExpoSecureStore', () => {
  const values = new Map();
  return { __esModule: true, default: {
    getValueWithKeyAsync: async (key) => values.get(key) ?? null,
    setValueWithKeyAsync: async (value, key) => { values.set(key, value); },
    deleteValueWithKeyAsync: async (key) => { values.delete(key); },
  } };
});
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true, NetInfoStateType: jest.requireActual('@react-native-community/netinfo/lib/commonjs/internal/types').NetInfoStateType,
  default: { fetch: jest.fn(async () => ({ isConnected: true })) },
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///mock' },
  File: jest.fn().mockImplementation((_directory, name) => ({
    uri: `file:///mock/${name}`, exists: true, create: jest.fn(), write: jest.fn(),
  })),
}));
beforeEach(() => {
  jest.restoreAllMocks();
  require('./sqlite-mock.cjs').reset();
  jest.mocked(require('@react-native-community/netinfo').default.fetch).mockResolvedValue({ isConnected: true });
});
