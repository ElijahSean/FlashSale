/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+[.]ts$': 'ts-jest' },
  testEnvironment: 'node',
};
