/**
 * Safety guard for the test suite.
 *
 * The API tests TRUNCATE every table in the database they connect to. To make
 * sure that can never be a development, staging or production database, tests
 * only run when the database name ends in `_test`.
 *
 * Error messages name the database only; they never include the connection
 * string, which can contain a password.
 */

export const TEST_DB_SUFFIX = '_test';

/** Returns the database name from a PostgreSQL connection string, or null if it can't be parsed. */
export function databaseNameFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    return name || null;
  } catch {
    return null;
  }
}

export function isTestDatabaseName(name: string | null | undefined): name is string {
  return typeof name === 'string' && name.endsWith(TEST_DB_SUFFIX);
}

export class UnsafeTestDatabaseError extends Error {
  constructor(found: string | null, where: string) {
    super(
      `Refusing to run tests: ${where} database is ${found ? `"${found}"` : 'missing or unparseable'}. ` +
        `The test suite deletes all data, so the database name must end in "${TEST_DB_SUFFIX}" ` +
        `(for example marketing_platform_test). Point DATABASE_URL at a dedicated test database.`,
    );
    this.name = 'UnsafeTestDatabaseError';
  }
}

/** Throws unless the connection string names a database ending in `_test`. */
export function assertTestDatabaseUrl(url: string | undefined): void {
  const name = databaseNameFromUrl(url);
  if (!isTestDatabaseName(name)) throw new UnsafeTestDatabaseError(name, 'the DATABASE_URL');
}

/** Throws unless the database actually connected to ends in `_test`. */
export function assertConnectedTestDatabase(currentDatabase: string | null | undefined): void {
  if (!isTestDatabaseName(currentDatabase)) throw new UnsafeTestDatabaseError(currentDatabase ?? null, 'the connected');
}
