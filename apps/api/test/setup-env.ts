// Loaded by Jest before every test file. CI overrides DATABASE_URL/REDIS_URL.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://marketing_admin@localhost:5432/marketing_platform_test?schema=public';
process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/marketing_platform(\?|$)/, '/marketing_platform_test$1');
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-xx';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-x';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = `/tmp/amp-test-storage-${process.pid}`;
process.env.API_URL = 'http://localhost:4000';
// Jobs are processed in-process by the tests via processAiJob(); no Redis worker needed.
process.env.QUEUE_ENABLED = 'false';
process.env.AI_PROVIDER = 'mock';
process.env.THROTTLE_DISABLED = 'true';
