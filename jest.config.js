const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './'
});

const uuidPath = require.resolve('uuid');

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // if using TypeScript with a baseUrl set to the root directory then you need the below for alias' to work
  moduleDirectories: ['node_modules', '<rootDir>/'],
  testEnvironment: '@happy-dom/jest-environment',
  testPathIgnorePatterns: ['/node_modules/', '/__helpers__/(?!.*\\.test\\.[jt]sx?$)'],
  moduleNameMapper: {
    '^uuid$': uuidPath,
    'better-sqlite3': '<rootDir>/__mocks__/better-sqlite3.js'
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    },
    './utils/refresh.ts': {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    },
    './app/api/': {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40
    },
    './scrapers/services/': {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40
    }
  }
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async

// next/jest always prepends '/node_modules/' to transformIgnorePatterns and Jest skips a file if ANY
// pattern matches, so a custom allowlist passed above is never effective. Override the final list here
// so ESM-only packages (sequelize, uuid and TanStack) are transformed.
const TRANSFORM_ALLOWLIST = [
  'sequelize',
  'uuid',
  '@tanstack'
];

const baseJestConfig = createJestConfig(customJestConfig);

module.exports = async () => {
  const config = await baseJestConfig();
  config.transformIgnorePatterns = [
    '^.+\\.module\\.(css|sass|scss)$',
    // Ignore a file only if it lives under node_modules and no allowlisted package appears in its path
    // (this also covers nested copies such as node_modules/msw/node_modules/@open-draft/...).
    `^(?!.*[\\\\/](?:${TRANSFORM_ALLOWLIST.join('|')})[\\\\/]).*[\\\\/]node_modules[\\\\/]`
  ];
  return config;
};
