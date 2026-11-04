/* Writes docs/api/openapi.json. Import it into Postman/Insomnia as a collection. */
import 'reflect-metadata';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('AI Marketing Platform API').setVersion('1.0.0').addBearerAuth().addServer('http://localhost:4000').build(),
  );
  const out = path.resolve(__dirname, '../../../../docs/api/openapi.json');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`Wrote ${out} (${Object.keys(doc.paths).length} paths)`);
  await app.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
