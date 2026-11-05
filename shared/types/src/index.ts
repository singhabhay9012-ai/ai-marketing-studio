// Shared contracts between web, api and worker. Keep these framework-free.

export const ORG_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'EDITOR', 'VIEWER'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Higher number = more privilege. Used for "at least role X" checks. */
export const ROLE_RANK: Record<OrgRole, number> = {
  VIEWER: 10,
  EDITOR: 20,
  MANAGER: 30,
  ADMIN: 40,
  OWNER: 50,
};

export const roleAtLeast = (actual: OrgRole, required: OrgRole) =>
  ROLE_RANK[actual] >= ROLE_RANK[required];

export const PLATFORMS = [
  'INSTAGRAM',
  'FACEBOOK',
  'WEBSITE',
  'GOOGLE_BUSINESS',
  'GOOGLE_ADS',
  'WHATSAPP',
  'LINKEDIN',
  'PINTEREST',
  'YOUTUBE',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ProductStatus = 'DRAFT' | 'ANALYSIS_PENDING' | 'ACTIVE' | 'ARCHIVED';

export const QUEUES = {
  AI_ANALYSIS: 'ai-analysis',
  AI_CONTENT: 'ai-content',
  IMAGE_GENERATION: 'image-generation',
  BULK_IMPORT: 'bulk-import',
  EXPORTS: 'exports',
  PUBLISHING: 'publishing',
  WEBHOOKS: 'webhooks',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface AiJobPayload {
  aiJobId: string;
  organizationId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  memberships: Array<{ organizationId: string; organizationName: string; slug: string; role: OrgRole }>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Structured AI outputs (blueprint §7: never a single unstructured blob) ──

export interface UncertainAttribute {
  field: string;
  value: string;
  confidence: number; // 0..1
  reason: string;
}

export interface ProductAnalysis {
  summary: string;
  category: string;
  visibleAttributes: Record<string, string>;
  likelyUseCases: string[];
  differentiators: string[];
  audienceHypotheses: string[];
  missingInformation: string[];
  uncertain: UncertainAttribute[];
  qualityWarnings: string[];
}

export interface MarketingStrategy {
  positioning: string;
  audienceSegments: Array<{ name: string; description: string }>;
  messagePillars: string[];
  objectives: string[];
  recommendedChannels: Platform[];
  calendarIdeas: Array<{ week: number; idea: string }>;
}

export interface ChannelContent {
  platform: Platform;
  variants: Array<{ headline?: string; body: string; cta?: string; hashtags?: string[] }>;
  seo?: { metaTitle: string; metaDescription: string; headings: string[]; altText: string };
  /** AI-suggested keywords. NOT measured search volume — see blueprint §7. */
  keywordSuggestions: { source: 'ai-suggestion'; keywords: string[] };
  qualityWarnings: string[];
}
