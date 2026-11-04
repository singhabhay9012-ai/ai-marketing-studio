import { z } from 'zod';
import { ORG_ROLES, PLATFORMS } from '@amp/shared-types';

export * from './platform-specs';

// ── Primitives ──
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use #RRGGBB');
export const currencySchema = z.string().length(3).toUpperCase();
export const moneySchema = z.coerce.number().nonnegative().max(1_000_000_000).multipleOf(0.01);

// ── Auth ──
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  organizationName: z.string().trim().min(2).max(120).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export type LoginInput = z.infer<typeof loginSchema>;

// ── Organisations ──
export const createOrganizationSchema = z.object({ name: z.string().trim().min(2).max(120) });
export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(ORG_ROLES).refine((r) => r !== 'OWNER', 'Ownership cannot be granted by invitation'),
});

// ── Brands ──
export const brandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  colors: z.array(hexColorSchema).max(12).default([]),
  fonts: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
  voice: z.string().trim().max(1000).optional(),
  audience: z.string().trim().max(1000).optional(),
  guidelines: z.record(z.unknown()).default({}),
});
export type BrandInput = z.infer<typeof brandSchema>;

// ── Products ──
export const productSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    sku: z.string().trim().max(64).optional(),
    category: z.string().trim().max(120).optional(),
    description: z.string().trim().max(5000).optional(),
    price: moneySchema.optional(),
    salePrice: moneySchema.optional(),
    currency: currencySchema.default('INR'),
    features: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
    attributes: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
    audience: z.string().trim().max(1000).optional(),
    offerDetails: z.string().trim().max(1000).optional(),
  })
  .refine((p) => p.salePrice === undefined || p.price === undefined || p.salePrice <= p.price, {
    message: 'Sale price cannot exceed price',
    path: ['salePrice'],
  });
export type ProductInput = z.infer<typeof productSchema>;

/** Treat blank spreadsheet cells as "not provided". */
const blank = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema);

/** One CSV/XLSX row in a bulk import. Strings in, coerced values out. */
export const bulkProductRowSchema = z.object({
  name: z.string({ required_error: 'name is required' }).trim().min(1, 'name is required').max(200),
  sku: blank(z.string().trim().max(64).optional()),
  category: blank(z.string().trim().max(120).optional()),
  description: blank(z.string().trim().max(5000).optional()),
  price: blank(moneySchema.optional()),
  currency: blank(currencySchema.default('INR')),
  features: z
    .string()
    .optional()
    .transform((s) => (s ? s.split('|').map((f) => f.trim()).filter(Boolean) : [])),
  image_url: blank(z.string().url().optional()),
});
export type BulkProductRow = z.infer<typeof bulkProductRowSchema>;

// ── Uploads ──
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const requestUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_IMAGE_TYPES),
  fileSize: z.number().int().positive().max(MAX_IMAGE_BYTES, 'Image must be 10 MB or smaller'),
});

// ── AI outputs: validated before storage ──
export const productAnalysisSchema = z.object({
  summary: z.string().min(1).max(2000),
  category: z.string().max(200),
  visibleAttributes: z.record(z.string()),
  likelyUseCases: z.array(z.string()).max(20),
  differentiators: z.array(z.string()).max(20),
  audienceHypotheses: z.array(z.string()).max(20),
  missingInformation: z.array(z.string()).max(30),
  uncertain: z
    .array(
      z.object({
        field: z.string(),
        value: z.string(),
        confidence: z.number().min(0).max(1),
        reason: z.string(),
      }),
    )
    .max(30),
  qualityWarnings: z.array(z.string()).max(30),
});

export const marketingStrategySchema = z.object({
  positioning: z.string().min(1).max(2000),
  audienceSegments: z.array(z.object({ name: z.string(), description: z.string() })).max(10),
  messagePillars: z.array(z.string()).max(10),
  objectives: z.array(z.string()).max(10),
  recommendedChannels: z.array(z.enum(PLATFORMS)).max(PLATFORMS.length),
  calendarIdeas: z.array(z.object({ week: z.number().int().min(1), idea: z.string() })).max(52),
});

export const channelContentSchema = z.object({
  platform: z.enum(PLATFORMS),
  variants: z
    .array(
      z.object({
        headline: z.string().optional(),
        body: z.string().min(1),
        cta: z.string().optional(),
        hashtags: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(10),
  seo: z
    .object({
      metaTitle: z.string(),
      metaDescription: z.string(),
      headings: z.array(z.string()),
      altText: z.string(),
    })
    .optional(),
  keywordSuggestions: z.object({ source: z.literal('ai-suggestion'), keywords: z.array(z.string()) }),
  qualityWarnings: z.array(z.string()),
});

export const productAnalysisRequestSchema = z.object({ productId: z.string().uuid() });
export const strategyRequestSchema = z.object({
  productId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  objective: z.string().trim().min(2).max(500),
});
export const contentRequestSchema = z.object({
  productId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(PLATFORMS.length),
});
