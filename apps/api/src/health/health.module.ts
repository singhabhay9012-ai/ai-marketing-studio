import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.module';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  /** Liveness: the process is up. */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies reachable. */
  @Public()
  @Get()
  async ready() {
    const checks: Record<string, 'up' | 'down' | 'disabled'> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }
    if (this.queue.enabled) {
      try {
        checks.redis = (await this.queue.redis().ping()) === 'PONG' ? 'up' : 'down';
      } catch {
        checks.redis = 'down';
      }
    } else checks.redis = 'disabled';

    const ok = Object.values(checks).every((v) => v !== 'down');
    if (!ok) throw new ServiceUnavailableException({ status: 'error', checks });
    return { status: 'ok', checks };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
