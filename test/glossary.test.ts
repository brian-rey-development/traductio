import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { extractGlossary, readGlossary } from '../src/translate/glossary.ts';

describe('extractGlossary', () => {
  it('collects capitalized names that recur mid-sentence at or above the threshold', () => {
    const texts = [
      'The cat saw Alice near the river. The dog saw Alice too. A bird watched Alice from above.',
      'Nobody expected the White Rabbit, but the White Rabbit arrived anyway.',
    ];
    assert.deepEqual(extractGlossary(texts, 3), { Alice: 'Alice' });
    assert.deepEqual(extractGlossary(texts, 2), { Alice: 'Alice', 'White Rabbit': 'White Rabbit' });
  });

  it('ignores capitalized words that only open sentences', () => {
    assert.deepEqual(extractGlossary(['Alice ran fast. Alice ran home. Alice slept well.'], 1), {});
  });

  it('orders terms by frequency so the most common names come first', () => {
    const texts = ['We met Bob and Alice. We met Bob and Alice again. Then we met Bob alone.'];
    assert.deepEqual(Object.keys(extractGlossary(texts, 2)), ['Bob', 'Alice']);
  });
});

describe('readGlossary', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rosetta-glossary-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns an empty glossary when no file is given', async () => {
    assert.deepEqual(await readGlossary(undefined), {});
  });

  it('reads a term mapping written as JSON', async () => {
    const path = join(dir, 'glossary.json');
    await writeFile(path, JSON.stringify({ 'the Shire': 'la Comarca' }));
    assert.deepEqual(await readGlossary(path), { 'the Shire': 'la Comarca' });
  });

  it('rejects JSON that is not a mapping of terms to strings', async () => {
    const path = join(dir, 'glossary.json');
    await writeFile(path, JSON.stringify({ Shire: 42 }));
    await assert.rejects(readGlossary(path), /must be a JSON object mapping terms to translations/);
    await writeFile(path, JSON.stringify(['Shire']));
    await assert.rejects(readGlossary(path), /must be a JSON object mapping terms to translations/);
  });
});
