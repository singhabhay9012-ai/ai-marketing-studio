import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp, isSwaggerEnabled } from './bootstrap';
import { env } from './config/env';

async function main() {
  const app = await createApp();
  const port = env().API_PORT;
  await app.listen(port);
  const docs = isSwaggerEnabled() ? `  ·  Docs on http://localhost:${port}/api/docs` : '';
  Logger.log(`API on http://localhost:${port}/api/v1${docs}`, 'Bootstrap');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
