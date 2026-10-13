import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import JSZip from 'jszip';
import { translateBook, type TranslateSettings } from '../src/pipeline.ts';
import { startFakeServer, writeFixtureEpub, xhtmlPage, type FakeServer } from './helpers.ts';

const TRANSLATOR = 'fake-translator';
const REVIEWER = 'fake-reviewer';
const CHAPTER = xhtmlPage(
  '<h1>Chapter One</h1><p>Alice was <em>very</em> tired&nbsp;today.</p><ul><li>Item<ul><li>Nested</li></ul></li></ul>',
);
const REVIEW_MARKER = 'DRAFT (Spanish):\n';

const fakeModel = (prompt: string): string => {
  const draft = prompt.split(REVIEW_MARKER)[1];
  if (draft !== undefined) return `¡${draft}`;
  return (prompt.split('\n').at(-1) ?? '').toUpperCase();
};

const readEntry = async (path: string, entry: string): Promise<string> => {
  const zip = await JSZip.loadAsync(await readFile(path));
  return (await zip.file(entry)?.async('string')) ?? '';
};

describe('translateBook', () => {
  let server: FakeServer;
  let dir: string;
  let settings: TranslateSettings;
  const originalCacheHome = process.env.XDG_CACHE_HOME;

  before(async () => {
    server = await startFakeServer([TRANSLATOR, REVIEWER], fakeModel);
  });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rosetta-'));
    process.env.XDG_CACHE_HOME = join(dir, 'cache');
    await writeFixtureEpub(join(dir, 'book.epub'), CHAPTER);
    settings = {
      input: join(dir, 'book.epub'),
      output: join(dir, 'book.es.epub'),
      reportPath: join(dir, 'book.es.report.md'),
      from: undefined,
      to: 'es',
      translator: TRANSLATOR,
      reviewer: undefined,
      glossary: {},
      concurrency: 2,
      limit: undefined,
      apiUrl: server.url,
    };
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  after(() => {
    server.close();
    process.env.XDG_CACHE_HOME = originalCacheHome;
  });

  it('writes a valid EPUB that keeps markup, structure and the table of contents', async () => {
    const summary = await translateBook(settings);
    assert.deepEqual([summary.segments, summary.failed], [5, 0]);

    const zip = await JSZip.loadAsync(await readFile(settings.output));
    assert.equal(Object.keys(zip.files)[0], 'mimetype');
    const chapter = await readEntry(settings.output, 'OEBPS/text/one.xhtml');
    assert.match(chapter, /<h1>CHAPTER ONE<\/h1>/);
    assert.match(chapter, /<p>ALICE WAS <em>VERY<\/em> TIRED TODAY\.<\/p>/);
    assert.match(chapter, /<li>ITEM<ul><li>NESTED<\/li><\/ul><\/li>/);
    assert.match(chapter, /xml:lang="es" lang="es"/);
    assert.match(await readEntry(settings.output, 'OEBPS/toc.ncx'), /<text>CHAPTER ONE<\/text>/);
    assert.match(await readEntry(settings.output, 'OEBPS/content.opf'), /<dc:language>es<\/dc:language>/);
  });

  it('resumes from the cache without calling the model again', async () => {
    await translateBook(settings);
    const callsAfterFirstRun = server.calls();
    await translateBook(settings);
    assert.equal(server.calls(), callsAfterFirstRun);
  });

  it('applies accepted revisions from the review pass', async () => {
    await translateBook({ ...settings, reviewer: REVIEWER });
    assert.match(await readEntry(settings.output, 'OEBPS/text/one.xhtml'), /<p>¡ALICE WAS <em>VERY<\/em>/);
  });
});
