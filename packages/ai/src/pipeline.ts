import { Prisma, PrismaClient, releaseCredits, settleCredits } from '@amp/database';
import type { MarketingStrategy, Platform, ProductAnalysis } from '@amp/shared-types';
import {
  channelContentSchema,
  checkTextAgainstSpec,
  marketingStrategySchema,
  PLATFORM_SPECS,
  productAnalysisSchema,
} from '@amp/validation';
import type { AiProvider, BrandContext, ProductContext } from './provider';
import { PROMPTS } from './prompts';

export interface ProcessOptions {
  /** Produces short-lived signed URLs for product images (provider vision input). */
  imageUrls?: (storageKeys: string[]) => Promise<string[]>;
  /** True when the queue will not retry again; failures then release credits. */
  isFinalAttempt: boolean;
}

export type ProcessOutcome = 'completed' | 'cancelled' | 'failed' | 'skipped';

/**
 * Executes one AIJob end-to-end:
 *   load → mark PROCESSING → call provider → validate output → persist
 *   → settle credits → COMPLETED
 * On failure: retryable errors are re-thrown (queue retries, credits stay held)
 * until the final attempt, when the job is FAILED and credits are released.
 */
export async function processAiJob(db: PrismaClient, provider: AiProvider, aiJobId: string, opts: ProcessOptions): Promise<ProcessOutcome> {
  const job = await db.aIJob.findUnique({ where: { id: aiJobId } });
  if (!job) return 'skipped';
  if (job.status === 'COMPLETED') return 'skipped';
  if (job.status === 'CANCELLED') {
    await releaseCredits(db, job.id);
    return 'cancelled';
  }

  // Claim the job (guards against two workers picking it up).
  const claimed = await db.aIJob.updateMany({
    where: { id: job.id, status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] } },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, startedAt: job.startedAt ?? new Date(), progress: 10, error: null },
  });
  if (claimed.count === 0) return 'skipped';

  try {
    const input = job.inputData as Record<string, unknown>;
    const product = await db.product.findFirstOrThrow({
      where: { id: job.productId!, organizationId: job.organizationId },
      include: { brand: true, images: { where: { status: 'UPLOADED' }, orderBy: { position: 'asc' }, take: 4 } },
    });
    const productCtx = toProductContext(product);
    const brandCtx: BrandContext = {
      name: product.brand.name,
      voice: product.brand.voice,
      audience: product.brand.audience,
      guidelines: (product.brand.guidelines ?? {}) as Record<string, unknown>,
    };
    const confirmedAnalysis = (product.analysis ?? null) as ProductAnalysis | null;

    let outputData: Prisma.InputJsonValue;
    let model = job.model;
    let providerRequestId: string | undefined;
    let promptVersion: number;

    switch (job.jobType) {
      case 'PRODUCT_ANALYSIS': {
        const imageUrls = opts.imageUrls ? await opts.imageUrls(product.images.map((i) => i.storageKey)) : [];
        const r = await provider.analyzeProduct({ product: productCtx, brand: brandCtx, imageUrls });
        const analysis = productAnalysisSchema.parse(r.output);
        outputData = analysis as unknown as Prisma.InputJsonValue;
        ({ model, providerRequestId } = r);
        promptVersion = PROMPTS.productAnalysis.version;
        break;
      }
      case 'STRATEGY': {
        const r = await provider.generateStrategy({ product: productCtx, brand: brandCtx, analysis: confirmedAnalysis, objective: String(input.objective ?? '') });
        const strategy = marketingStrategySchema.parse(r.output);
        outputData = strategy as unknown as Prisma.InputJsonValue;
        ({ model, providerRequestId } = r);
        promptVersion = PROMPTS.strategy.version;
        if (job.campaignId) {
          await db.campaign.updateMany({ where: { id: job.campaignId, organizationId: job.organizationId }, data: { strategy: outputData } });
        }
        break;
      }
      case 'CONTENT': {
        const platforms = (input.platforms ?? []) as Platform[];
        const strategy = job.campaignId
          ? (((await db.campaign.findFirst({ where: { id: job.campaignId, organizationId: job.organizationId } }))?.strategy ?? null) as MarketingStrategy | null)
          : null;
        const assetIds: string[] = [];
        for (const [i, platform] of platforms.entries()) {
          const spec = PLATFORM_SPECS[platform];
          const r = await provider.generateContent({ product: productCtx, brand: brandCtx, analysis: confirmedAnalysis, strategy, platform, spec });
          const content = channelContentSchema.parse(r.output);
          // Quality gate: flag (don't silently truncate) anything outside platform limits.
          for (const v of content.variants) {
            for (const violation of checkTextAgainstSpec(platform, { [spec.bodyField]: v.body, headline: v.headline }, v.hashtags)) {
              content.qualityWarnings.push(violation.message);
            }
          }
          // Regeneration retires earlier unapproved drafts; APPROVED work is never touched.
          await db.contentAsset.updateMany({
            where: { organizationId: job.organizationId, productId: product.id, campaignId: job.campaignId, platform, status: { in: ['DRAFT', 'REVIEW'] } },
            data: { status: 'ARCHIVED' },
          });
          const asset = await db.contentAsset.create({
            data: {
              organizationId: job.organizationId,
              productId: product.id,
              campaignId: job.campaignId,
              sourceJobId: job.id,
              platform,
              contentType: 'channel-copy',
              title: `${product.name} — ${platform}`,
              contentData: content as unknown as Prisma.InputJsonValue,
            },
          });
          assetIds.push(asset.id);
          ({ model, providerRequestId } = r);
          await db.aIJob.update({ where: { id: job.id }, data: { progress: 10 + Math.round(((i + 1) / platforms.length) * 80) } });
        }
        outputData = { contentAssetIds: assetIds };
        promptVersion = PROMPTS.channelContent.version;
        break;
      }
      default:
        throw new Error(`Unsupported job type ${job.jobType}`);
    }

    // Job may have been cancelled while the provider call was in flight.
    const fresh = await db.aIJob.findUnique({ where: { id: job.id }, select: { status: true } });
    if (fresh?.status === 'CANCELLED') {
      await releaseCredits(db, job.id);
      return 'cancelled';
    }

    await settleCredits(db, job.id, job.creditsReserved, `${job.jobType} job`);
    await db.aIJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        outputData,
        model,
        providerRequestId,
        creditsUsed: job.creditsReserved,
        completedAt: new Date(),
        inputData: { ...(input as object), promptVersion } as Prisma.InputJsonValue,
      },
    });
    return 'completed';
  } catch (err) {
    const retryable = (err as { retryable?: boolean }).retryable === true;
    const safeMessage = safeError(err);
    if (retryable && !opts.isFinalAttempt) {
      await db.aIJob.update({ where: { id: job.id }, data: { status: 'QUEUED', error: `Retrying: ${safeMessage}` } });
      throw err; // let the queue back off and retry
    }
    await db.aIJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: safeMessage, completedAt: new Date() } });
    await releaseCredits(db, job.id);
    return 'failed';
  }
}

function toProductContext(p: {
  name: string;
  category: string | null;
  description: string | null;
  features: string[];
  price: Prisma.Decimal | null;
  currency: string;
  audience: string | null;
  offerDetails: string | null;
  attributes: Prisma.JsonValue;
}): ProductContext {
  return {
    name: p.name,
    category: p.category,
    description: p.description,
    features: p.features,
    price: p.price?.toString() ?? null,
    currency: p.currency,
    audience: p.audience,
    offerDetails: p.offerDetails,
    attributes: (p.attributes ?? {}) as Record<string, unknown>,
  };
}

/** User-facing error text: actionable, without stack traces or secrets. */
function safeError(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in err) return 'The AI response did not match the expected format.';
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 500);
}
