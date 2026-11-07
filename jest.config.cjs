module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/scripts/test-setup.cjs'],
  testMatch: ['<rootDir>/src/**/*.test.[jt]s?(x)'],
};
