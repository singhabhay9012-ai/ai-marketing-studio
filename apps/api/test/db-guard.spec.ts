import {
  assertConnectedTestDatabase,
  assertTestDatabaseUrl,
  databaseNameFromUrl,
  isTestDatabaseName,
  UnsafeTestDatabaseError,
} from './db-guard';

describe('test database guard', () => {
  it('extracts the database name from local and hosted connection strings', () => {
    expect(databaseNameFromUrl('postgresql://u:p@localhost:5432/marketing_platform_test?schema=public')).toBe('marketing_platform_test');
    expect(databaseNameFromUrl('postgresql://u:p@ep-x.example.neon.tech/neondb?sslmode=require')).toBe('neondb');
    expect(databaseNameFromUrl('postgresql://u:p@localhost:5432/')).toBeNull();
    expect(databaseNameFromUrl('not a url')).toBeNull();
    expect(databaseNameFromUrl(undefined)).toBeNull();
  });

  it('accepts only names ending in _test', () => {
    expect(isTestDatabaseName('marketing_platform_test')).toBe(true);
    expect(isTestDatabaseName('marketing_platform')).toBe(false);
    expect(isTestDatabaseName('neondb')).toBe(false);
    expect(isTestDatabaseName('test_marketing')).toBe(false);
    expect(isTestDatabaseName(null)).toBe(false);
  });

  it('refuses a development or hosted database URL', () => {
    expect(() => assertTestDatabaseUrl('postgresql://u:p@localhost:5432/marketing_platform')).toThrow(UnsafeTestDatabaseError);
    expect(() => assertTestDatabaseUrl('postgresql://u:p@ep-x.example.neon.tech/neondb?sslmode=require')).toThrow(UnsafeTestDatabaseError);
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(UnsafeTestDatabaseError);
    expect(() => assertTestDatabaseUrl('postgresql://u:p@localhost:5432/marketing_platform_test')).not.toThrow();
  });

  it('never puts the connection string or password in the error message', () => {
    try {
      assertTestDatabaseUrl('postgresql://admin:s3cr3t-pass@db.example.com:5432/production');
      throw new Error('expected guard to throw');
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain('"production"');
      expect(message).not.toContain('s3cr3t-pass');
      expect(message).not.toContain('db.example.com');
    }
  });

  it('checks the database actually connected to', () => {
    expect(() => assertConnectedTestDatabase('marketing_platform')).toThrow(UnsafeTestDatabaseError);
    expect(() => assertConnectedTestDatabase(undefined)).toThrow(UnsafeTestDatabaseError);
    expect(() => assertConnectedTestDatabase('marketing_platform_test')).not.toThrow();
  });
});
