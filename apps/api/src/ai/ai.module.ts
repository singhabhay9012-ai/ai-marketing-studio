import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AIJobType, InsufficientCreditsError, Prisma, releaseCredits, reserveCredits } from '@amp/database';
import { contentRequestSchema, productAnalysisRequestSchema, productAnalysisSchema, strategyRequestSchema } from '@amp/validation';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/core.module';
import { RequireRole, Tenant, TenantContext } from '../common/decorators';
import { parsePagination } from '../common/util';
import { ApiZodBody, ZodBody } from '../common/zod';
import { QueueService } from '../queue/queue.module';

const confirmSchema = z.object({ analysis: productAnalysisSchema });

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
  ) {}

  /** Credit cost is data (CreditCost table), never hard-coded. */
  private async costFor(jobType: AIJobType, units = 1) {
    const cost = await this.prisma.creditCost.findFirst({
      where: { jobType, effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!cost) throw new Error(`No credit cost configured for ${jobType}`);
    return cost.credits * units;
  }

  private async ensureProduct(t: TenantContext, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, organizationId: t.organizationId, status: { not: 'ARCHIVED' } } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async ensureCampaign(t: TenantContext, campaignId: string | undefined, productId: string) {
    if (!campaignId) return;
    const c = await this.prisma.campaign.findFirst({ where: { id: campaignId, organizationId: t.organizationId, productId } });
    if (!c) throw new NotFoundException('Campaign not found');
  }

  /** Create job → reserve credits → enqueue. A failed enqueue releases the hold. */
  private async createJob(t: TenantContext, jobType: AIJobType, data: { productId: string; campaignId?: string; inputData: Prisma.InputJsonValue; units?: number }) {
    const credits = await this.costFor(jobType, data.units);
    const job = await this.prisma.aIJob.create({
      data: {
        organizationId: t.organizationId,
        productId: data.productId,
        campaignId: data.campaignId,
        createdById: t.userId,
        jobType,
        provider: env().AI_PROVIDER,
        model: 'pending',
        inputData: data.inputData,
        creditsReserved: credits,
      },
    });
    try {
      await reserveCredits(this.prisma, t.organizationId, job.id, credits);
    } catch (e) {
      await this.prisma.aIJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: 'Insufficient credits' } });
      if (e instanceof InsufficientCreditsError) {
        throw new HttpException({ statusCode: 402, message: e.message, available: e.available, required: e.required }, HttpStatus.PAYMENT_REQUIRED);
      }
      throw e;
    }
    try {
      await this.queue.enqueueAiJob(jobType, { aiJobId: job.id, organizationId: t.organizationId });
    } catch (e) {
      await releaseCredits(this.prisma, job.id);
      await this.prisma.aIJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: 'Could not queue job; please retry' } });
      throw e;
    }
    await this.audit.log({ action: `ai.${jobType.toLowerCase()}`, organizationId: t.organizationId, userId: t.userId, entityType: 'AIJob', entityId: job.id });
    return job;
  }

  async productAnalysis(t: TenantContext, productId: string) {
    await this.ensureProduct(t, productId);
    const job = await this.createJob(t, 'PRODUCT_ANALYSIS', { productId, inputData: { productId } });
    await this.prisma.product.update({ where: { id: productId }, data: { status: 'ANALYSIS_PENDING' } });
    return job;
  }

  async strategy(t: TenantContext, input: z.infer<typeof strategyRequestSchema>) {
    await this.ensureProduct(t, input.productId);
    await this.ensureCampaign(t, input.campaignId, input.productId);
    return this.createJob(t, 'STRATEGY', { productId: input.productId, campaignId: input.campaignId, inputData: input });
  }

  async content(t: TenantContext, input: z.infer<typeof contentRequestSchema>) {
    const product = await this.ensureProduct(t, input.productId);
    if (!product.analysis) throw new BadRequestException('Confirm the product analysis before generating public-facing content');
    await this.ensureCampaign(t, input.campaignId, input.productId);
    const platforms = [...new Set(input.platforms)];
    return this.createJob(t, 'CONTENT', { productId: input.productId, campaignId: input.campaignId, inputData: { ...input, platforms }, units: platforms.length });
  }

  /**
   * Human confirmation step (blueprint §7): the user reviews/corrects the AI
   * analysis; only the confirmed version is used for public-facing copy.
   */
  async confirmAnalysis(t: TenantContext, jobId: string, analysis: z.infer<typeof productAnalysisSchema>) {
    const job = await this.getJob(t, jobId);
    if (job.jobType !== 'PRODUCT_ANALYSIS' || job.status !== 'COMPLETED' || !job.productId) {
      throw new BadRequestException('Only a completed product analysis can be confirmed');
    }
    const product = await this.prisma.product.update({
      where: { id: job.productId },
      data: { analysis: { ...analysis, confirmedAt: new Date().toISOString(), confirmedBy: t.userId, sourceJobId: job.id }, status: 'ACTIVE' },
    });
    await this.audit.log({ action: 'ai.analysis_confirmed', organizationId: t.organizationId, userId: t.userId, entityType: 'Product', entityId: product.id });
    return product;
  }

  async getJob(t: TenantContext, jobId: string) {
    const job = await this.prisma.aIJob.findFirst({ where: { id: jobId, organizationId: t.organizationId } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async listJobs(t: TenantContext, q: { page?: string; pageSize?: string; productId?: string }) {
    const { page, pageSize, skip, take } = parsePagination(q);
    const where: Prisma.AIJobWhereInput = { organizationId: t.organizationId, ...(q.productId ? { productId: q.productId } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.aIJob.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.aIJob.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async cancel(t: TenantContext, jobId: string) {
    const res = await this.prisma.aIJob.updateMany({
      where: { id: jobId, organizationId: t.organizationId, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    if (res.count === 0) throw new BadRequestException('Job is not running');
    // Release immediately if queued; a running worker also checks and releases.
    await releaseCredits(this.prisma, jobId);
    return this.getJob(t, jobId);
  }

}

@ApiTags('ai')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('product-analysis')
  @RequireRole('EDITOR')
  @HttpCode(202)
  @ApiZodBody(productAnalysisRequestSchema)
  analyse(@Tenant() t: TenantContext, @ZodBody(productAnalysisRequestSchema) body: z.infer<typeof productAnalysisRequestSchema>) {
    return this.ai.productAnalysis(t, body.productId);
  }

  @Post('product-analysis/:jobId/confirm')
  @RequireRole('EDITOR')
  @HttpCode(200)
  @ApiZodBody(confirmSchema)
  confirm(@Tenant() t: TenantContext, @Param('jobId', ParseUUIDPipe) jobId: string, @ZodBody(confirmSchema) body: z.infer<typeof confirmSchema>) {
    return this.ai.confirmAnalysis(t, jobId, body.analysis);
  }

  @Post('strategy')
  @RequireRole('EDITOR')
  @HttpCode(202)
  @ApiZodBody(strategyRequestSchema)
  strategy(@Tenant() t: TenantContext, @ZodBody(strategyRequestSchema) body: z.infer<typeof strategyRequestSchema>) {
    return this.ai.strategy(t, body);
  }

  @Post('content')
  @RequireRole('EDITOR')
  @HttpCode(202)
  @ApiZodBody(contentRequestSchema)
  content(@Tenant() t: TenantContext, @ZodBody(contentRequestSchema) body: z.infer<typeof contentRequestSchema>) {
    return this.ai.content(t, body);
  }

  @Get('jobs')
  @RequireRole('VIEWER')
  list(@Tenant() t: TenantContext, @Query() q: Record<string, string>) {
    return this.ai.listJobs(t, q);
  }

  @Get('jobs/:jobId')
  @RequireRole('VIEWER')
  get(@Tenant() t: TenantContext, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.ai.getJob(t, jobId);
  }

  @Post('jobs/:jobId/cancel')
  @RequireRole('EDITOR')
  @HttpCode(200)
  cancel(@Tenant() t: TenantContext, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.ai.cancel(t, jobId);
  }
}

@Module({ controllers: [AiController], providers: [AiService] })
export class AiModule {}
