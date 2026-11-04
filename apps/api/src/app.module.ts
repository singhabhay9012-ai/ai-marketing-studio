import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { BrandsModule } from './brands/brands.module';
import { CoreModule } from './common/core.module';
import { ContentModule } from './content/content.module';
import { JwtAuthGuard, TenantGuard } from './common/guards';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { HealthModule } from './health/health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.service';
import { ProductsModule } from './products/products.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    // Default API rate limit; auth routes set stricter limits.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      // Escape hatch for test suites that create many accounts; never set in deployed envs.
      skipIf: () => process.env.NODE_ENV === 'test' && process.env.THROTTLE_DISABLED === 'true',
    }),
    JwtModule.register({ global: true }),
    PrismaModule,
    CoreModule,
    QueueModule,
    StorageModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    BrandsModule,
    ProductsModule,
    AiModule,
    ContentModule,
    BillingModule,
  ],
  providers: [
    // Order matters: rate limit → authenticate → tenant/role check.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
