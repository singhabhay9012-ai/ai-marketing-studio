import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env, Env } from './config/env';

/** API docs (Swagger UI and the OpenAPI JSON) are served only outside production. */
export function isSwaggerEnabled(e: Pick<Env, 'NODE_ENV'> = env()): boolean {
  return e.NODE_ENV !== 'production';
}

/** Shared by main.ts and the e2e tests so tests exercise the real HTTP stack. */
export async function createApp(): Promise<INestApplication> {
  const e = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: e.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });

  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({
    origin: e.CORS_ALLOWLIST.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
  });
  app.use(cookieParser());

  // Request size limits. Raw bodies only where needed (local signed uploads, CSV import).
  app.use('/api/v1/storage/local', express.raw({ type: () => true, limit: '12mb' }));
  app.use('/api/v1/products/import', express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  if (isSwaggerEnabled(e)) {
    const config = new DocumentBuilder()
      .setTitle('AI Marketing Platform API')
      .setDescription('REST API v1. Protected routes need a Bearer token; organisation-scoped routes also need x-organization-id.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), { jsonDocumentUrl: 'api/docs-json' });
  }

  return app;
}
