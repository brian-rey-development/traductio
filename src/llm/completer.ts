import { cacheKey, type Cache } from './cache.ts';
import type { LlmClient } from './client.ts';

export type Completer = {
  readonly complete: (model: string, prompt: string) => Promise<string>;
  readonly modelCalls: () => number;
};

const CHARS_PER_TOKEN_FLOOR = 2;
const TOKEN_HEADROOM = 256;
const MAX_OUTPUT_TOKENS = 4096;

const outputBudget = (prompt: string): number =>
  Math.min(MAX_OUTPUT_TOKENS, Math.ceil(prompt.length / CHARS_PER_TOKEN_FLOOR) + TOKEN_HEADROOM);

export const createCompleter = (client: LlmClient, cache: Cache): Completer => {
  const inFlight = new Map<string, Promise<string>>();
  let modelCalls = 0;

  const callModel = async (key: string, model: string, prompt: string): Promise<string> => {
    modelCalls += 1;
    const { text, truncated } = await client.complete(model, prompt, outputBudget(prompt));
    if (text.trim() && !truncated) await cache.set(key, text);
    return text;
  };

  const complete = (model: string, prompt: string): Promise<string> => {
    const key = cacheKey(model, prompt);
    const cached = cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = inFlight.get(key) ?? callModel(key, model, prompt).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  };

  return { complete, modelCalls: () => modelCalls };
};
