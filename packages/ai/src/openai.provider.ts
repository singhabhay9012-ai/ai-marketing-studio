import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ChannelContent, MarketingStrategy, ProductAnalysis } from '@amp/shared-types';
import { channelContentSchema, marketingStrategySchema, productAnalysisSchema } from '@amp/validation';
import { AiProvider, BrandContext, ProductContext, ProviderResult, RetryableProviderError } from './provider';
import { PROMPTS } from './prompts';

interface OpenAiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * OpenAI implementation using Chat Completions with JSON-schema structured
 * output. No SDK dependency so the provider stays small and swappable.
 * Untrusted, user-supplied product text is wrapped in <untrusted> tags and the
 * system prompt instructs the model to treat it as data.
 */
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';

  constructor(private readonly opts: OpenAiOptions) {
    if (!opts.apiKey) throw new Error('OPENAI_API_KEY is required for the openai provider');
  }

  analyzeProduct(input: { product: ProductContext; brand: BrandContext; imageUrls: string[] }): Promise<ProviderResult<ProductAnalysis>> {
    const p = PROMPTS.productAnalysis;
    return this.call(p.system, p.user(input), productAnalysisSchema, 'product_analysis', input.imageUrls);
  }

  generateStrategy(input: Parameters<AiProvider['generateStrategy']>[0]): Promise<ProviderResult<MarketingStrategy>> {
    const p = PROMPTS.strategy;
    return this.call(p.system, p.user(input), marketingStrategySchema, 'marketing_strategy');
  }

  generateContent(input: Parameters<AiProvider['generateContent']>[0]): Promise<ProviderResult<ChannelContent>> {
    const p = PROMPTS.channelContent;
    return this.call(p.system, p.user(input), channelContentSchema, 'channel_content');
  }

  private async call<T>(system: string, user: string, schema: ZodTypeAny, name: string, imageUrls: string[] = []): Promise<ProviderResult<T>> {
    const content: unknown[] = [{ type: 'text', text: user }, ...imageUrls.slice(0, 4).map((url) => ({ type: 'image_url', image_url: { url } }))];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 60_000);
    let res: Response;
    try {
      res = await fetch(`${this.opts.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.opts.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name, schema: (zodToJsonSchema as (s: unknown, o: unknown) => object)(schema, { target: "openAi" }), strict: false },
          },
        }),
      });
    } catch (e) {
      throw new RetryableProviderError(`OpenAI request failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429 || res.status >= 500) throw new RetryableProviderError(`OpenAI ${res.status}`);
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const json = (await res.json()) as {
      id: string;
      model: string;
      choices: Array<{ message: { content: string | null; refusal?: string | null } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const msg = json.choices[0]?.message;
    if (msg?.refusal) throw new Error(`Model refused: ${msg.refusal}`);
    const parsed = schema.safeParse(JSON.parse(msg?.content ?? '{}'));
    if (!parsed.success) throw new RetryableProviderError(`Model output failed validation: ${parsed.error.issues[0]?.message}`);
    return {
      output: parsed.data as T,
      model: json.model,
      providerRequestId: json.id,
      usage: { inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens },
    };
  }
}
