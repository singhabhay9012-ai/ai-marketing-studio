import type { ChannelContent, MarketingStrategy, Platform, ProductAnalysis } from '@amp/shared-types';
import type { AiProvider, BrandContext, ProductContext, ProviderResult } from './provider';

/**
 * Deterministic provider for development, tests and demos. It only restates
 * supplied information and flags everything it would otherwise have to guess,
 * which also makes it a reference for how real providers should behave.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  private readonly model = 'mock-1';

  async analyzeProduct({ product, imageUrls }: { product: ProductContext; brand: BrandContext; imageUrls: string[] }): Promise<ProviderResult<ProductAnalysis>> {
    const missing: string[] = [];
    if (!product.description) missing.push('description');
    if (!product.price) missing.push('price');
    if (!product.audience) missing.push('target audience');
    if (product.features.length === 0) missing.push('key features');
    if (imageUrls.length === 0) missing.push('product photo');

    const uncertain = [] as ProductAnalysis['uncertain'];
    if (!product.category) {
      uncertain.push({ field: 'category', value: 'General merchandise', confidence: 0.4, reason: 'No category supplied; inferred from name only' });
    }
    if (imageUrls.length > 0) {
      uncertain.push({ field: 'material', value: 'Not determinable', confidence: 0.3, reason: 'Material cannot be confirmed from a photo; please specify' });
    }

    return {
      model: this.model,
      output: {
        summary: `${product.name}${product.category ? ` — ${product.category}` : ''}. ${product.description ?? 'No description supplied yet.'}`.trim(),
        category: product.category ?? 'General merchandise',
        visibleAttributes: Object.fromEntries(Object.entries(product.attributes).map(([k, v]) => [k, String(v)])),
        likelyUseCases: product.features.length ? product.features.map((f) => `Customers who value: ${f.toLowerCase()}`) : ['Everyday use'],
        differentiators: product.features.slice(0, 3),
        audienceHypotheses: product.audience ? [product.audience] : ['Needs confirmation from the business'],
        missingInformation: missing,
        uncertain,
        qualityWarnings: missing.length ? [`Supply ${missing.join(', ')} for stronger, safer copy.`] : [],
      },
    };
  }

  async generateStrategy({ product, brand, objective }: { product: ProductContext; brand: BrandContext; analysis: ProductAnalysis | null; objective: string }): Promise<ProviderResult<MarketingStrategy>> {
    const audience = product.audience ?? brand.audience ?? 'Core customers';
    return {
      model: this.model,
      output: {
        positioning: `${product.name} by ${brand.name}: ${product.features[0] ?? 'quality you can rely on'}, for ${audience.toLowerCase()}.`,
        audienceSegments: [
          { name: 'Primary', description: audience },
          { name: 'Gift buyers', description: `People buying ${product.name} for someone else` },
        ],
        messagePillars: (product.features.length ? product.features : ['Quality', 'Value', 'Trust']).slice(0, 4),
        objectives: [objective],
        recommendedChannels: ['INSTAGRAM', 'FACEBOOK', 'WEBSITE'],
        calendarIdeas: [
          { week: 1, idea: 'Launch post introducing the product' },
          { week: 2, idea: 'Feature spotlight carousel' },
          { week: 3, idea: 'Customer use-case story' },
          { week: 4, idea: `Offer reminder${product.offerDetails ? `: ${product.offerDetails}` : ''}` },
        ],
      },
    };
  }

  async generateContent({ product, brand, platform, spec }: { product: ProductContext; brand: BrandContext; analysis: ProductAnalysis | null; strategy: MarketingStrategy | null; platform: Platform; spec: { textLimits: Record<string, number>; bodyField: string } }): Promise<ProviderResult<ChannelContent>> {
    const tag = (s: string) => `#${s.replace(/[^a-zA-Z0-9]/g, '')}`;
    const hashtags = [tag(brand.name), tag(product.name), ...(product.category ? [tag(product.category)] : [])];
    const lead = product.features[0] ? `${product.features[0]}.` : '';
    const body = `Meet ${product.name}. ${lead} ${product.description ?? ''}`.replace(/\s+/g, ' ').trim();
    const limit = spec.textLimits[spec.bodyField] ?? 500;

    const output: ChannelContent = {
      platform,
      variants: [
        { headline: product.name.slice(0, 40), body: body.slice(0, limit), cta: 'Shop now', hashtags },
        { headline: `New from ${brand.name}`.slice(0, 40), body: `${product.name} is here. ${lead}`.trim().slice(0, limit), cta: 'Learn more', hashtags },
      ],
      keywordSuggestions: { source: 'ai-suggestion', keywords: [product.name.toLowerCase(), ...(product.category ? [product.category.toLowerCase()] : [])] },
      qualityWarnings: [],
    };
    if (platform === 'WEBSITE') {
      output.seo = {
        metaTitle: `${product.name} | ${brand.name}`.slice(0, 60),
        metaDescription: body.slice(0, 160),
        headings: [product.name, 'Features', 'Details'],
        altText: `${product.name} product photo`.slice(0, 125),
      };
    }
    return { model: this.model, output };
  }
}
