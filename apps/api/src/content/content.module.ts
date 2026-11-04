import { BadRequestException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Prisma } from '@amp/database';
import { PLATFORMS } from '@amp/shared-types';
import { channelContentSchema } from '@amp/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/core.module';
import { RequireRole, Tenant, TenantContext } from '../common/decorators';
import { ApiZodBody, ZodBody } from '../common/zod';

const editSchema = z.object({
  contentData: channelContentSchema.optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'ARCHIVED']).optional(),
});

/**
 * Content studio foundation. Edits create a new version row linked by
 * previousId so approved work is never lost when a section is regenerated.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(t: TenantContext, q: { productId?: string; platform?: string }) {
    if (q.platform && !(PLATFORMS as readonly string[]).includes(q.platform)) throw new BadRequestException('Unknown platform');
    return this.prisma.contentAsset.findMany({
      where: {
        organizationId: t.organizationId,
        status: { not: 'ARCHIVED' },
        ...(q.productId ? { productId: q.productId } : {}),
        ...(q.platform ? { platform: q.platform as (typeof PLATFORMS)[number] } : {}),
      },
      orderBy: [{ platform: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async edit(t: TenantContext, id: string, input: z.infer<typeof editSchema>) {
    const current = await this.prisma.contentAsset.findFirst({ where: { id, organizationId: t.organizationId } });
    if (!current) throw new NotFoundException('Content not found');

    if (!input.contentData) {
      return this.prisma.contentAsset.update({ where: { id }, data: { status: input.status } });
    }
    const [, next] = await this.prisma.$transaction([
      this.prisma.contentAsset.update({ where: { id }, data: { status: 'ARCHIVED' } }),
      this.prisma.contentAsset.create({
        data: {
          organizationId: current.organizationId,
          productId: current.productId,
          campaignId: current.campaignId,
          sourceJobId: current.sourceJobId,
          platform: current.platform,
          contentType: current.contentType,
          title: current.title,
          contentData: input.contentData as unknown as Prisma.InputJsonValue,
          status: input.status ?? 'DRAFT',
          version: current.version + 1,
          previousId: current.id,
        },
      }),
    ]);
    await this.audit.log({ action: 'content.edit', organizationId: t.organizationId, userId: t.userId, entityType: 'ContentAsset', entityId: next.id });
    return next;
  }
}

@ApiTags('content')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @RequireRole('VIEWER')
  list(@Tenant() t: TenantContext, @Query() q: Record<string, string>) {
    return this.content.list(t, q);
  }

  @Patch(':id')
  @RequireRole('EDITOR')
  @ApiZodBody(editSchema)
  edit(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(editSchema) body: z.infer<typeof editSchema>) {
    return this.content.edit(t, id, body);
  }
}

@Module({ controllers: [ContentController], providers: [ContentService] })
export class ContentModule {}
