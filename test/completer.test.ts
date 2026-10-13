import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Cache } from '../src/llm/cache.ts';
import type { Completion, LlmClient } from '../src/llm/client.ts';
import { createCompleter } from '../src/llm/completer.ts';

type FakeClient = { readonly client: LlmClient; readonly calls: () => number; readonly budgets: number[] };

const fakeClient = (respond: (model: string, prompt: string) => Completion): FakeClient => {
  let calls = 0;
  const budgets: number[] = [];
  const client: LlmClient = {
    complete: (model, prompt, maxTokens) => {
      calls += 1;
      budgets.push(maxTokens);
      return Promise.resolve(respond(model, prompt));
    },
    listModels: () => Promise.resolve([]),
  };
  return { client, calls: () => calls, budgets };
};

const memoryCache = (): Cache & { readonly store: Map<string, string> } => {
  const store = new Map<string, string>();
  return {
    store,
    get: (key) => store.get(key),
    set: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
  };
};

describe('createCompleter', () => {
  it('serves a repeated prompt from the cache and counts only real model calls', async () => {
    const fake = fakeClient(() => ({ text: 'hola', truncated: false }));
    const completer = createCompleter(fake.client, memoryCache());
    assert.equal(await completer.complete('m', 'hello'), 'hola');
    assert.equal(await completer.complete('m', 'hello'), 'hola');
    assert.equal(fake.calls(), 1);
    assert.equal(completer.modelCalls(), 1);
  });

  it('deduplicates concurrent requests for the same prompt', async () => {
    const fake = fakeClient(() => ({ text: 'hola', truncated: false }));
    const completer = createCompleter(fake.client, memoryCache());
    const results = await Promise.all([
      completer.complete('m', 'hello'),
      completer.complete('m', 'hello'),
      completer.complete('m', 'hello'),
    ]);
    assert.deepEqual(results, ['hola', 'hola', 'hola']);
    assert.equal(fake.calls(), 1);
  });

  it('keys the cache by model as well as prompt', async () => {
    const fake = fakeClient((model) => ({ text: `from ${model}`, truncated: false }));
    const completer = createCompleter(fake.client, memoryCache());
    assert.equal(await completer.complete('one', 'hello'), 'from one');
    assert.equal(await completer.complete('two', 'hello'), 'from two');
    assert.equal(fake.calls(), 2);
  });

  it('never caches empty or truncated completions, so a later run asks again', async () => {
    const outcomes: Completion[] = [
      { text: '   ', truncated: false },
      { text: 'partial', truncated: true },
      { text: 'final', truncated: false },
    ];
    const fake = fakeClient(() => outcomes.shift() ?? { text: 'final', truncated: false });
    const completer = createCompleter(fake.client, memoryCache());
    assert.equal(await completer.complete('m', 'hello'), '   ');
    assert.equal(await completer.complete('m', 'hello'), 'partial');
    assert.equal(await completer.complete('m', 'hello'), 'final');
    assert.equal(await completer.complete('m', 'hello'), 'final');
    assert.equal(fake.calls(), 3);
  });

  it('sizes the output budget from the prompt and caps it', async () => {
    const fake = fakeClient(() => ({ text: 'ok', truncated: false }));
    const completer = createCompleter(fake.client, memoryCache());
    await completer.complete('m', 'x'.repeat(100));
    await completer.complete('m', 'x'.repeat(20_000));
    assert.deepEqual(fake.budgets, [306, 4096]);
  });
});
