import type { AiProvider } from './provider';
import { MockAiProvider } from './mock.provider';
import { OpenAiProvider } from './openai.provider';

export * from './provider';
export * from './pipeline';
export { PROMPTS } from './prompts';
export { MockAiProvider, OpenAiProvider };

export function createAiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  switch (env.AI_PROVIDER ?? 'mock') {
    case 'openai':
      return new OpenAiProvider({ apiKey: env.OPENAI_API_KEY ?? '', model: env.OPENAI_MODEL ?? 'gpt-4.1-mini' });
    case 'mock':
      return new MockAiProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER "${env.AI_PROVIDER}"`);
  }
}
