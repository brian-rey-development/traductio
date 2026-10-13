import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { isRecord } from '../src/shared/guards.ts';
import { startFakeServer, writeFixtureEpub, writeMultiChapterEpub, xhtmlPage } from './helpers.ts';

type CliResult = { readonly code: number; readonly stdout: string; readonly stderr: string };

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI_PATH = join(ROOT, 'src', 'cli', 'cli.ts');
const TIMEOUT_MS = 30_000;

const runCli = (args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<CliResult> =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { cwd: ROOT, env, timeout: TIMEOUT_MS },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolve({ code, stdout, stderr });
      },
    );
  });

const readEntry = async (path: string, entry: string): Promise<string> => {
  const zip = await JSZip.loadAsync(await readFile(path));
  return (await zip.file(entry)?.async('string')) ?? '';
};

describe('rosetta cli parsing', () => {
  it('runs through the installed bin launcher', async () => {
    const result = await new Promise<CliResult>((resolve) => {
      execFile(join(ROOT, 'bin', 'rosetta'), ['--help'], { cwd: ROOT, timeout: TIMEOUT_MS }, (error, out, err) => {
        resolve({ code: error === null ? 0 : 1, stdout: out, stderr: err });
      });
    });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes('Usage:'), result.stdout);
  });

  it('prints usage and succeeds for help and for no command', async () => {
    for (const args of [['--help'], []]) {
      const { code, stdout } = await runCli(args);
      assert.equal(code, 0);
      assert.ok(stdout.includes('Usage:'), stdout);
      assert.ok(stdout.includes('rosetta translate <book.epub>'), stdout);
    }
  });

  it('rejects an unknown command with a pointer to help', async () => {
    const { code, stderr } = await runCli(['bogus']);
    assert.equal(code, 1);
    assert.ok(stderr.includes('Unknown command "bogus". Run rosetta --help'), stderr);
  });

  it('requires an epub path before doing any work', async () => {
    for (const args of [['translate'], ['translate', 'notes.txt', '--to', 'es'], ['inspect']]) {
      const { code, stderr } = await runCli(args);
      assert.equal(code, 1, args.join(' '));
      assert.ok(stderr.includes('Pass the path to an .epub file'), stderr);
    }
  });

  it('requires a target language and rejects unknown language codes', async () => {
    const missing = await runCli(['translate', 'book.epub']);
    assert.equal(missing.code, 1);
    assert.ok(missing.stderr.includes('--to is required'), missing.stderr);
    const unknown = await runCli(['translate', 'book.epub', '--to', 'xx']);
    assert.equal(unknown.code, 1);
    assert.ok(unknown.stderr.includes('Unknown language code "xx"'), unknown.stderr);
  });

  it('rejects numeric options that are not positive integers', async () => {
    const cases = [
      { args: ['translate', 'book.epub', '--to', 'es', '--concurrency', '0'], message: '--concurrency' },
      { args: ['translate', 'book.epub', '--to', 'es', '--limit', '1.5'], message: '--limit' },
      { args: ['glossary', 'book.epub', '--min', '0'], message: '--min' },
    ];
    for (const { args, message } of cases) {
      const { code, stderr } = await runCli(args);
      assert.equal(code, 1, args.join(' '));
      assert.ok(stderr.includes(`${message} must be a positive integer`), stderr);
    }
  });

  it('rejects a chapter selection that is not numbers or ranges', async () => {
    const { code, stderr } = await runCli(['translate', 'book.epub', '--to', 'es', '--chapters', 'third']);
    assert.equal(code, 1);
    assert.ok(stderr.includes('is not a chapter number or range'), stderr);
  });

  it('refuses to overwrite the source book', async () => {
    const { code, stderr } = await runCli(['translate', 'book.epub', '--to', 'es', '--out', 'book.epub']);
    assert.equal(code, 1);
    assert.ok(stderr.includes('--out must not overwrite the source book'), stderr);
  });

  it('reports a missing input file instead of crashing with a stack trace', async () => {
    const { code, stderr } = await runCli(['inspect', 'missing.epub']);
    assert.equal(code, 1);
    assert.ok(stderr.includes('rosetta:'), stderr);
    assert.ok(stderr.includes('ENOENT'), stderr);
  });
});

describe('rosetta cli offline commands', () => {
  let dir: string;
  let bookPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rosetta-cli-'));
    bookPath = join(dir, 'book.epub');
    await writeFixtureEpub(bookPath, xhtmlPage('<h1>Chapter One</h1><p>Alice saw Alice in the Alice mirror.</p>'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('inspects a book without touching a model server', async () => {
    const { code, stdout } = await runCli(['inspect', bookPath]);
    assert.equal(code, 0, stdout);
    assert.ok(stdout.includes('Language:'), stdout);
    assert.ok(stdout.includes('Segments:'), stdout);
    assert.ok(stdout.includes('Chapters:'), stdout);
    assert.ok(stdout.includes('1. Chapter One (2 segments)'), stdout);
  });

  it('keeps chapter numbers stable when a middle chapter file is unreadable', async () => {
    await writeMultiChapterEpub(bookPath, [
      xhtmlPage('<h1>Alpha</h1><p>First body.</p>'),
      xhtmlPage('<h1>Beta</h1><p>Second body.</p>'),
      xhtmlPage('<h1>Gamma</h1><p>Third body.</p>'),
    ]);
    const zip = await JSZip.loadAsync(await readFile(bookPath));
    zip.remove('OEBPS/text/chapter-2.xhtml');
    await writeFile(bookPath, await zip.generateAsync({ type: 'nodebuffer' }));
    const { code, stdout } = await runCli(['inspect', bookPath]);
    assert.equal(code, 0, stdout);
    assert.ok(stdout.includes('1. Alpha (2 segments)'), stdout);
    assert.ok(stdout.includes('2. chapter-2.xhtml (0 segments)'), stdout);
    assert.ok(stdout.includes('3. Gamma (2 segments)'), stdout);
  });

  it('rejects a chapter beyond the spine before any model call is needed', async () => {
    const { code, stderr } = await runCli([
      'translate',
      bookPath,
      '--to',
      'es',
      '--chapters',
      '9',
      '--api',
      'http://127.0.0.1:9/v1',
    ]);
    assert.equal(code, 1);
    assert.ok(stderr.includes('chapter 9 is out of range, the book has 1 chapter'), stderr);
  });

  it('translates a single selected chapter through the real binary', async () => {
    const server = await startFakeServer(['fake-translator'], (prompt) =>
      (prompt.split('\n').at(-1) ?? '').toUpperCase(),
    );
    try {
      await writeMultiChapterEpub(bookPath, [
        xhtmlPage('<h1>Alpha</h1><p>First body.</p>'),
        xhtmlPage('<h1>Beta</h1><p>Second body.</p>'),
      ]);
      const output = join(dir, 'book.es.epub');
      const env = { ...process.env, XDG_CACHE_HOME: join(dir, 'cache') };
      const args = [
        'translate',
        bookPath,
        '--to',
        'es',
        '--chapters',
        '2',
        '--model',
        'fake-translator',
        '--api',
        server.url,
        '--out',
        output,
      ];
      const { code, stdout, stderr } = await runCli(args, env);
      assert.equal(code, 0, stderr);
      assert.ok(stdout.includes('chapters 2'), stdout);
      assert.equal(server.calls(), 6);
      assert.ok((await readEntry(output, 'OEBPS/text/chapter-1.xhtml')).includes('<p>First body.</p>'));
      assert.ok((await readEntry(output, 'OEBPS/text/chapter-2.xhtml')).includes('<p>SECOND BODY.</p>'));
    } finally {
      server.close();
    }
  });

  it('writes an editable glossary file', async () => {
    const outPath = join(dir, 'glossary.json');
    const { code, stdout } = await runCli(['glossary', bookPath, '--out', outPath, '--min', '2']);
    assert.equal(code, 0, stdout);
    assert.ok(stdout.includes('terms to'), stdout);
    const parsed = JSON.parse(await readFile(outPath, 'utf8')) as unknown;
    assert.ok(isRecord(parsed));
    assert.equal(parsed['Alice'], 'Alice');
  });
});
