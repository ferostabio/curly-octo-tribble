const expo = require('jest-expo/jest-preset');
const [transformer, options] = expo.transform['\\.[jt]sx?$'];

module.exports = {
  preset: 'jest-expo',
  transform: {
    ...expo.transform,
    '\\.[jt]sx?$': [transformer, {
      ...options,
      caller: { ...options.caller, supportsReactCompiler: true },
    }],
  },
  setupFilesAfterEnv: ['<rootDir>/scripts/test-setup.cjs'],
  testMatch: ['<rootDir>/src/**/*.test.[jt]s?(x)'],
};
