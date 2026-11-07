jest.mock('expo-sqlite', () => require('./sqlite-mock.cjs'));
jest.mock('expo-crypto', () => ({ getRandomBytesAsync: async () => new Uint8Array(32) }));
beforeEach(() => require('./sqlite-mock.cjs').reset());
