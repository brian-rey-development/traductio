import { errorMessage, isRecord } from './guards.ts';

const REQUEST_TIMEOUT_MS = 10 * 60_000;
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 1_500;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
const FINISH_REASON_LENGTH = 'length';

export type Completion = { readonly text: string; readonly truncated: boolean };

export type LlmClient = {
  readonly complete: (model: string, prompt: string, maxTokens: number) => Promise<Completion>;
  readonly listModels: () => Promise<string[]>;
};

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`Model server returned ${status}: ${body.slice(0, 300)}`);
    this.status = status;
  }
}

const isRetryable = (error: unknown): boolean =>
  !(error instanceof HttpError) || error.status === HTTP_TOO_MANY_REQUESTS || error.status >= HTTP_SERVER_ERROR;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async <T>(task: () => Promise<T>, attempt = 1): Promise<T> => {
  try {
    return await task();
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS || !isRetryable(error)) throw error;
    await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    return withRetry(task, attempt + 1);
  }
};

const requestJson = async (url: string, init: RequestInit = {}): Promise<unknown> => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new HttpError(response.status, await response.text());
  return response.json();
};

const parseCompletion = (body: unknown): Completion => {
  const choice = isRecord(body) && Array.isArray(body.choices) ? body.choices[0] : undefined;
  const message = isRecord(choice) ? choice.message : undefined;
  if (!isRecord(message) || typeof message.content !== 'string') {
    throw new Error('Unexpected chat completion response');
  }
  return { text: message.content, truncated: isRecord(choice) && choice.finish_reason === FINISH_REASON_LENGTH };
};

const parseModelIds = (body: unknown): string[] => {
  if (!isRecord(body) || !Array.isArray(body.data)) throw new Error('Unexpected model list response');
  return body.data.flatMap((model: unknown) => (isRecord(model) && typeof model.id === 'string' ? [model.id] : []));
};

const chatRequest = (model: string, prompt: string, maxTokens: number): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: maxTokens,
    stream: false,
  }),
});

export const createClient = (baseUrl: string): LlmClient => ({
  complete: (model, prompt, maxTokens) =>
    withRetry(async () => parseCompletion(await requestJson(`${baseUrl}/chat/completions`, chatRequest(model, prompt, maxTokens)))),
  listModels: async () => parseModelIds(await requestJson(`${baseUrl}/models`)),
});

export const isModelInstalled = (installed: readonly string[], model: string): boolean =>
  installed.includes(model) || installed.includes(`${model}:latest`);

export const listModelsOrExplain = async (client: LlmClient, baseUrl: string): Promise<string[]> => {
  try {
    return await client.listModels();
  } catch (error) {
    throw new Error(`Cannot list models at ${baseUrl} (${errorMessage(error)}). Is Ollama running? Try: rosetta doctor`, {
      cause: error,
    });
  }
};

export const assertModelsInstalled = async (client: LlmClient, baseUrl: string, models: readonly string[]): Promise<void> => {
  const installed = await listModelsOrExplain(client, baseUrl);
  const missing = models.filter((model) => !isModelInstalled(installed, model));
  if (missing.length > 0) {
    throw new Error(`Model not installed: ${missing.join(', ')}. Install it with: ollama pull ${missing[0]}`);
  }
};
