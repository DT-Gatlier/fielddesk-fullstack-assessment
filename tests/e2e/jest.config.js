module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/suites/**/*.test.ts'],
  setupFilesAfterEnv: ['./setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
        },
      },
    ],
  },
};
