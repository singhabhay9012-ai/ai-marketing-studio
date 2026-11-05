import type { MetadataRoute } from 'next';

/**
 * Every route in this app is a private workspace page or an auth page, so nothing may be
 * indexed. When public marketing pages are added, allow those paths here and add a sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
