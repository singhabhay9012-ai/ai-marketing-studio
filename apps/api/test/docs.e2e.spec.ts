import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { resetEnvCache } from '../src/config/env';

/** Phase 0: API docs must not be exposed in production. */
describe('API docs exposure', () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, STORAGE_SIGNING_SECRET: process.env.STORAGE_SIGNING_SECRET };

  async function boot(nodeEnv: 'test' | 'production'): Promise<INestApplication> {
    process.env.NODE_ENV = nodeEnv;
    // Production refuses the dev-only default signing secret.
    if (nodeEnv === 'production') process.env.STORAGE_SIGNING_SECRET = 'docs-test-signing-secret-0123456789';
    resetEnvCache();
    const app = await createApp();
    await app.init();
    return app;
  }

  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.STORAGE_SIGNING_SECRET === undefined) delete process.env.STORAGE_SIGNING_SECRET;
    else process.env.STORAGE_SIGNING_SECRET = saved.STORAGE_SIGNING_SECRET;
    resetEnvCache();
  });

  it('serves Swagger UI and the OpenAPI JSON outside production', async () => {
    const app = await boot('test');
    try {
      await request(app.getHttpServer()).get('/api/docs/').expect(200);
      const json = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
      expect(json.body.openapi).toMatch(/^3\./);
    } finally {
      await app.close();
    }
  });

  it('does not serve Swagger UI or the OpenAPI JSON in production', async () => {
    const app = await boot('production');
    try {
      await request(app.getHttpServer()).get('/api/docs/').expect(404);
      await request(app.getHttpServer()).get('/api/docs').expect(404);
      await request(app.getHttpServer()).get('/api/docs-json').expect(404);
      // The API itself is still up.
      await request(app.getHttpServer()).get('/api/v1/health').expect((res) => expect(res.status).not.toBe(404));
    } finally {
      await app.close();
    }
  });
});
