import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { assertModelsInstalled, createClient, isModelInstalled, type LlmClient } from '../src/llm/client.ts';

type Reply = { readonly status: number; readonly body: unknown };
type ScriptedServer = { readonly url: string; readonly requests: () => number; readonly close: () => void };

const completion = (content: string, finishReason = 'stop'): Reply => ({
  status: 200,
  body: { choices: [{ message: { content }, finish_reason: finishReason }] },
});
const failure = (status: number): Reply => ({ status, body: { error: 'boom' } });

const startScriptedServer = (respond: (attempt: number, url: string) => Reply): Promise<ScriptedServer> => {
  let requests = 0;
  const server: Server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      requests += 1;
      const reply = respond(requests, request.url ?? '');
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Scripted server did not bind to a TCP port'));
        return;
      }
      resolve({ url: `http://127.0.0.1:${address.port}/v1`, requests: () => requests, close: () => server.close() });
    });
  });
};

describe('createClient', () => {
  let server: ScriptedServer | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('retries server errors and returns the eventual completion', async () => {
    server = await startScriptedServer((attempt) => (attempt < 3 ? failure(500) : completion('hola')));
    const client = createClient(server.url, { retryDelayMs: 1 });
    assert.deepEqual(await client.complete('m', 'prompt', 16), { text: 'hola', truncated: false });
    assert.equal(server.requests(), 3);
  });

  it('retries rate limiting but not other client errors', async () => {
    server = await startScriptedServer((attempt) => (attempt === 1 ? failure(429) : completion('ok')));
    const client = createClient(server.url, { retryDelayMs: 1 });
    assert.equal((await client.complete('m', 'prompt', 16)).text, 'ok');
    assert.equal(server.requests(), 2);
  });

  it('fails a client error on the first attempt', async () => {
    server = await startScriptedServer(() => failure(400));
    const client = createClient(server.url, { retryDelayMs: 1 });
    await assert.rejects(client.complete('m', 'prompt', 16), /Model server returned 400/);
    assert.equal(server.requests(), 1);
  });

  it('gives up after the configured number of attempts', async () => {
    server = await startScriptedServer(() => failure(503));
    const client = createClient(server.url, { retryDelayMs: 1, maxAttempts: 3 });
    await assert.rejects(client.complete('m', 'prompt', 16), /Model server returned 503/);
    assert.equal(server.requests(), 3);
  });

  it('marks a length-limited completion as truncated', async () => {
    server = await startScriptedServer(() => completion('partial', 'length'));
    const client = createClient(server.url, { retryDelayMs: 1 });
    assert.deepEqual(await client.complete('m', 'prompt', 16), { text: 'partial', truncated: true });
  });

  it('rejects a malformed completion body', async () => {
    server = await startScriptedServer(() => ({ status: 200, body: { nope: true } }));
    const client = createClient(server.url, { retryDelayMs: 1 });
    await assert.rejects(client.complete('m', 'prompt', 16), /Unexpected chat completion response/);
  });

  it('lists model ids and skips entries without a string id', async () => {
    server = await startScriptedServer(() => ({
      status: 200,
      body: { data: [{ id: 'one' }, { id: 42 }, {}, { id: 'two' }] },
    }));
    const client = createClient(server.url, { retryDelayMs: 1 });
    assert.deepEqual(await client.listModels(), ['one', 'two']);
  });
});

describe('createClient options', () => {
  it('rejects retry options that would retry forever or sleep nonsense', () => {
    assert.throws(() => createClient('http://x/v1', { maxAttempts: 0 }), /maxAttempts must be a positive integer/);
    assert.throws(
      () => createClient('http://x/v1', { maxAttempts: Number.NaN }),
      /maxAttempts must be a positive integer/,
    );
    assert.throws(
      () => createClient('http://x/v1', { maxAttempts: Number.POSITIVE_INFINITY }),
      /maxAttempts must be a positive integer/,
    );
    assert.throws(
      () => createClient('http://x/v1', { retryDelayMs: Number.NaN }),
      /retryDelayMs must be a finite number of milliseconds/,
    );
  });
});

describe('model installation checks', () => {
  const stubClient = (models: string[] | Error): LlmClient => ({
    complete: () => Promise.reject(new Error('not used')),
    listModels: () => (models instanceof Error ? Promise.reject(models) : Promise.resolve(models)),
  });

  it('accepts an exact id or the implicit latest tag', () => {
    assert.equal(isModelInstalled(['qwen3:8b'], 'qwen3:8b'), true);
    assert.equal(isModelInstalled(['qwen3:latest'], 'qwen3'), true);
    assert.equal(isModelInstalled(['qwen3:8b'], 'qwen3'), false);
  });

  it('passes when every model is installed and names the missing ones otherwise', async () => {
    await assertModelsInstalled(stubClient(['a', 'b']), 'http://x/v1', ['a', 'b']);
    await assert.rejects(
      assertModelsInstalled(stubClient(['a']), 'http://x/v1', ['a', 'gone']),
      /Model not installed: gone\. Install it with: ollama pull gone/,
    );
  });

  it('explains how to recover when the server cannot be reached', async () => {
    await assert.rejects(
      assertModelsInstalled(stubClient(new Error('refused')), 'http://x/v1', ['a']),
      /Cannot list models at http:\/\/x\/v1 \(refused\)\. Is Ollama running\? Try: traductio doctor/,
    );
  });
});
