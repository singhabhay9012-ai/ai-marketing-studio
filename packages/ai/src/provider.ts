import type { ChannelContent, MarketingStrategy, Platform, ProductAnalysis } from '@amp/shared-types';
import type { PlatformSpec } from '@amp/validation';

export interface ProductContext {
  name: string;
  category?: string | null;
  description?: string | null;
  features: string[];
  price?: string | null;
  currency: string;
  audience?: string | null;
  offerDetails?: string | null;
  attributes: Record<string, unknown>;
}

export interface BrandContext {
  name: string;
  voice?: string | null;
  audience?: string | null;
  guidelines: Record<string, unknown>;
}

export interface ProviderResult<T> {
  output: T;
  model: string;
  providerRequestId?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * AI provider abstraction (blueprint §4 architecture principle).
 * Implementations must return data matching the shared schemas; the pipeline
 * validates every response before it is stored.
 */
export interface AiProvider {
  readonly name: string;
  analyzeProduct(input: { product: ProductContext; brand: BrandContext; imageUrls: string[] }): Promise<ProviderResult<ProductAnalysis>>;
  generateStrategy(input: {
    product: ProductContext;
    brand: BrandContext;
    analysis: ProductAnalysis | null;
    objective: string;
  }): Promise<ProviderResult<MarketingStrategy>>;
  generateContent(input: {
    product: ProductContext;
    brand: BrandContext;
    analysis: ProductAnalysis | null;
    strategy: MarketingStrategy | null;
    platform: Platform;
    spec: PlatformSpec;
  }): Promise<ProviderResult<ChannelContent>>;
}

/** Thrown for errors worth retrying (rate limits, timeouts, 5xx). */
export class RetryableProviderError extends Error {
  readonly retryable = true;
}
