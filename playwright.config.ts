import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke test config. Runs against the BUILT api and web apps
 * (run `pnpm build` first). The real run happens in CI.
 *
 * DATABASE SAFETY: the e2e test registers real users, so it must only ever hit a
 * dedicated test database. This mirrors apps/api/test/db-guard.ts (kept as a small
 * copy so this file survives moving apps/ in the next restructure). Errors name the
 * database only, never the connection string, which can contain a password.
 * Node's --env-file never overrides variables already set, so the DATABASE_URL
 * validated here is passed to the API explicitly and wins over any local .env.
 */
const TEST_DB_SUFFIX = '_test';

function databaseName(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || null;
  } catch {
    return null;
  }
}

const databaseUrl = process.env.DATABASE_URL;
const dbName = databaseName(databaseUrl);
if (!databaseUrl || !dbName || !dbName.endsWith(TEST_DB_SUFFIX)) {
  throw new Error(
    `Refusing to run e2e tests: DATABASE_URL database is ${dbName ? `"${dbName}"` : 'missing or unparseable'}. ` +
      `The tests create data, so the database name must end in "${TEST_DB_SUFFIX}" ` +
      `(for example marketing_platform_test). Set DATABASE_URL in your environment to a dedicated test database.`,
  );
}

const isCI = !!process.env.CI;
const apiUrl = 'http://localhost:4000';
const webUrl = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @amp/api start',
      url: `${apiUrl}/api/v1/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        // Explicit, validated test database (see the guard above).
        DATABASE_URL: databaseUrl,
        // Not NODE_ENV=test: that would change runtime behaviour. THROTTLE_DISABLED only
        // takes effect under NODE_ENV=test, so it is a no-op here; one registration per run stays under the limits.
        THROTTLE_DISABLED: 'true',
        AI_PROVIDER: 'mock',
        QUEUE_ENABLED: 'false',
        STORAGE_DRIVER: 'local',
        API_URL: apiUrl,
        WEB_URL: webUrl,
        CORS_ALLOWLIST: webUrl,
      },
    },
    {
      command: 'pnpm --filter @amp/web start',
      url: webUrl,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
