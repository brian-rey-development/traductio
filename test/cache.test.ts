import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { cacheKey, openCache } from '../src/llm/cache.ts';

const line = (key: string, value: string): string => `${JSON.stringify({ key, value })}\n`;

describe('openCache', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'traductio-cache-'));
    path = join(dir, 'nested', 'book.jsonl');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('opens empty when the file does not exist and persists across opens', async () => {
    const first = await openCache(path);
    assert.equal(first.get('missing'), undefined);
    await first.set('greeting', 'hola');
    const second = await openCache(path);
    assert.equal(second.get('greeting'), 'hola');
  });

  it('keeps the last value for a duplicated key and skips corrupt lines', async () => {
    const cache = await openCache(path);
    await cache.set('seed', 'x');
    await writeFile(path, `${line('a', 'old')}not json\n${line('a', 'new')}${line('b', 'two')}[1,2]\n`);
    const reopened = await openCache(path);
    assert.equal(reopened.get('a'), 'new');
    assert.equal(reopened.get('b'), 'two');
  });

  it('compacts duplicated and corrupt lines away on open', async () => {
    const cache = await openCache(path);
    await cache.set('seed', 'x');
    await writeFile(path, `${line('a', 'old')}${line('a', 'new')}garbage{\n${line('b', 'two')}`);
    await openCache(path);
    const stored = (await readFile(path, 'utf8')).split('\n').filter(Boolean);
    assert.deepEqual(stored, [line('a', 'new').trim(), line('b', 'two').trim()]);
  });

  it('does not fuse an append onto a final line left without its newline', async () => {
    const cache = await openCache(path);
    await cache.set('seed', 'x');
    await writeFile(path, line('a', 'one').trimEnd());
    const reopened = await openCache(path);
    await reopened.set('b', 'two');
    const again = await openCache(path);
    assert.equal(again.get('a'), 'one');
    assert.equal(again.get('b'), 'two');
  });

  it('keeps entries appended through two live handles', async () => {
    const first = await openCache(path);
    const second = await openCache(path);
    const writes = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? first : second).set(`k${i}`, `v${i}`));
    await Promise.all(writes);
    const reopened = await openCache(path);
    for (let i = 0; i < 20; i += 1) assert.equal(reopened.get(`k${i}`), `v${i}`);
  });

  it(
    'does not record a value whose append failed, so an identical retry persists it',
    { skip: (process.getuid?.() ?? 1) === 0 },
    async () => {
      const cache = await openCache(path);
      await cache.set('seed', 'x');
      await chmod(path, 0o400);
      try {
        await assert.rejects(cache.set('later', 'value'));
        assert.equal(cache.get('later'), undefined);
      } finally {
        await chmod(path, 0o600);
      }
      await cache.set('later', 'value');
      const reopened = await openCache(path);
      assert.equal(reopened.get('later'), 'value');
    },
  );

  it('drops a truncated final line and keeps appending safely', async () => {
    const cache = await openCache(path);
    await cache.set('seed', 'x');
    await writeFile(path, `${line('a', 'one')}{"key":"b","val`);
    const reopened = await openCache(path);
    assert.equal(reopened.get('b'), undefined);
    await reopened.set('b', 'two');
    const again = await openCache(path);
    assert.equal(again.get('a'), 'one');
    assert.equal(again.get('b'), 'two');
  });
});

describe('cacheKey', () => {
  it('is stable for the same parts and differs when a part changes', () => {
    assert.equal(cacheKey('model', 'prompt'), cacheKey('model', 'prompt'));
    assert.notEqual(cacheKey('model', 'prompt'), cacheKey('model', 'other'));
    assert.notEqual(cacheKey('a', 'bc'), cacheKey('ab', 'c'));
  });
});
