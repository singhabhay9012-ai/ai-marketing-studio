import type { Platform } from '@amp/shared-types';

/**
 * Platform specification registry (blueprint §8).
 *
 * Platform rules change. These values are a starting baseline and MUST be
 * re-verified against each platform's current documentation before launch.
 * Bump `version` and `verifiedAt` whenever a value changes, and keep this file
 * free of business logic so it can later move to a database table or CMS.
 */
export interface CreativeFormat {
  key: string;
  label: string;
  width: number;
  height: number;
  aspectRatio: string;
}

export interface PlatformSpec {
  platform: Platform;
  version: number;
  verifiedAt: string | null;
  formats: CreativeFormat[];
  textLimits: Record<string, number>;
  /** Which textLimits key governs the main copy body of a variant. */
  bodyField: string;
  maxHashtags?: number;
  acceptedMedia: string[];
  ctaOptions?: string[];
  publishingApi: 'available' | 'restricted' | 'none';
  notes?: string;
}

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  INSTAGRAM: {
    platform: 'INSTAGRAM',
    version: 1,
    bodyField: 'caption',
    verifiedAt: null,
    formats: [
      { key: 'feed-portrait', label: 'Feed (portrait)', width: 1080, height: 1350, aspectRatio: '4:5' },
      { key: 'feed-square', label: 'Feed (square)', width: 1080, height: 1080, aspectRatio: '1:1' },
      { key: 'story', label: 'Story / Reel cover', width: 1080, height: 1920, aspectRatio: '9:16' },
    ],
    textLimits: { caption: 2200 },
    maxHashtags: 30,
    acceptedMedia: ['image/jpeg', 'image/png', 'video/mp4'],
    publishingApi: 'restricted',
    notes: 'Publishing requires a Business/Creator account linked to a Facebook Page and app review.',
  },
  FACEBOOK: {
    platform: 'FACEBOOK',
    version: 1,
    bodyField: 'primaryText',
    verifiedAt: null,
    formats: [
      { key: 'feed', label: 'Feed', width: 1080, height: 1350, aspectRatio: '4:5' },
      { key: 'feed-landscape', label: 'Feed (landscape)', width: 1200, height: 630, aspectRatio: '1.91:1' },
    ],
    textLimits: { primaryText: 125, headline: 40, description: 30 },
    acceptedMedia: ['image/jpeg', 'image/png', 'video/mp4'],
    ctaOptions: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'CONTACT_US', 'ORDER_NOW'],
    publishingApi: 'restricted',
    notes: 'Primary text/headline limits are recommended display lengths, not hard API limits.',
  },
  WEBSITE: {
    platform: 'WEBSITE',
    version: 1,
    bodyField: 'shortDescription',
    verifiedAt: null,
    formats: [{ key: 'product-hero', label: 'Product hero', width: 1600, height: 1600, aspectRatio: '1:1' }],
    textLimits: { metaTitle: 60, metaDescription: 160, shortDescription: 300, altText: 125 },
    acceptedMedia: ['image/jpeg', 'image/png', 'image/webp'],
    publishingApi: 'none',
  },
  GOOGLE_BUSINESS: {
    platform: 'GOOGLE_BUSINESS',
    version: 1,
    bodyField: 'post',
    verifiedAt: null,
    formats: [{ key: 'post', label: 'Update post', width: 1200, height: 900, aspectRatio: '4:3' }],
    textLimits: { post: 1500 },
    acceptedMedia: ['image/jpeg', 'image/png'],
    ctaOptions: ['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'],
    publishingApi: 'restricted',
  },
  GOOGLE_ADS: {
    platform: 'GOOGLE_ADS',
    version: 1,
    bodyField: 'description',
    verifiedAt: null,
    formats: [
      { key: 'display-landscape', label: 'Display (landscape)', width: 1200, height: 628, aspectRatio: '1.91:1' },
      { key: 'display-square', label: 'Display (square)', width: 1200, height: 1200, aspectRatio: '1:1' },
    ],
    textLimits: { headline: 30, longHeadline: 90, description: 90 },
    acceptedMedia: ['image/jpeg', 'image/png'],
    publishingApi: 'restricted',
    notes: 'Responsive search ads accept up to 15 headlines and 4 descriptions.',
  },
  WHATSAPP: {
    platform: 'WHATSAPP',
    version: 1,
    bodyField: 'body',
    verifiedAt: null,
    formats: [{ key: 'image', label: 'Message image', width: 1080, height: 1080, aspectRatio: '1:1' }],
    textLimits: { body: 1024, footer: 60 },
    acceptedMedia: ['image/jpeg', 'image/png'],
    publishingApi: 'restricted',
    notes: 'Business-initiated messages require pre-approved templates via the WhatsApp Business Platform.',
  },
  LINKEDIN: {
    platform: 'LINKEDIN',
    version: 1,
    bodyField: 'post',
    verifiedAt: null,
    formats: [
      { key: 'post-landscape', label: 'Post (landscape)', width: 1200, height: 627, aspectRatio: '1.91:1' },
      { key: 'post-square', label: 'Post (square)', width: 1200, height: 1200, aspectRatio: '1:1' },
    ],
    textLimits: { post: 3000 },
    acceptedMedia: ['image/jpeg', 'image/png', 'application/pdf'],
    publishingApi: 'restricted',
  },
  PINTEREST: {
    platform: 'PINTEREST',
    version: 1,
    bodyField: 'description',
    verifiedAt: null,
    formats: [{ key: 'pin', label: 'Standard pin', width: 1000, height: 1500, aspectRatio: '2:3' }],
    textLimits: { title: 100, description: 500 },
    acceptedMedia: ['image/jpeg', 'image/png'],
    publishingApi: 'restricted',
  },
  YOUTUBE: {
    platform: 'YOUTUBE',
    version: 1,
    bodyField: 'description',
    verifiedAt: null,
    formats: [{ key: 'thumbnail', label: 'Thumbnail', width: 1280, height: 720, aspectRatio: '16:9' }],
    textLimits: { title: 100, description: 5000 },
    acceptedMedia: ['image/jpeg', 'image/png', 'video/mp4'],
    publishingApi: 'restricted',
  },
};

export interface SpecViolation {
  field: string;
  message: string;
}

/** Quality check used before approval: text length and hashtag count. */
export function checkTextAgainstSpec(
  platform: Platform,
  fields: Record<string, string | undefined>,
  hashtags: string[] = [],
): SpecViolation[] {
  const spec = PLATFORM_SPECS[platform];
  const violations: SpecViolation[] = [];
  for (const [field, limit] of Object.entries(spec.textLimits)) {
    const value = fields[field];
    if (value && value.length > limit) {
      violations.push({ field, message: `${field} is ${value.length} characters; limit is ${limit}` });
    }
  }
  if (spec.maxHashtags !== undefined && hashtags.length > spec.maxHashtags) {
    violations.push({ field: 'hashtags', message: `${hashtags.length} hashtags; limit is ${spec.maxHashtags}` });
  }
  return violations;
}
