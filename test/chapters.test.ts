import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadBook, type ContentFile } from '../src/epub/book.ts';
import { parseChapterSelection, selectChapterPaths, spineChapters } from '../src/epub/chapters.ts';
import { writeMultiChapterEpub, xhtmlPage } from './helpers.ts';

describe('parseChapterSelection', () => {
  it('parses single chapters, lists and inclusive ranges into sorted unique indexes', () => {
    assert.deepEqual(parseChapterSelection('3'), [3]);
    assert.deepEqual(parseChapterSelection('7,3,5-6,3'), [3, 5, 6, 7]);
    assert.deepEqual(parseChapterSelection(' 2 , 4 - 5 '), [2, 4, 5]);
  });

  it('rejects anything that is not a positive chapter number or range', () => {
    for (const spec of ['', 'x', '0', '3-', '-2', '3..5', '2,', '1.5']) {
      assert.throws(() => parseChapterSelection(spec), /is not a chapter number or range/, spec);
    }
  });

  it('rejects a range that ends before it starts', () => {
    assert.throws(() => parseChapterSelection('5-3'), /range 5-3 ends before it starts/);
  });
});

describe('spine chapter selection', () => {
  const contents: ContentFile[] = [
    { path: 'text/one.xhtml', kind: 'xhtml' },
    { path: 'text/two.xhtml', kind: 'xhtml' },
    { path: 'text/nav.xhtml', kind: 'nav' },
    { path: 'toc.ncx', kind: 'ncx' },
  ];

  it('numbers only spine content files, never navigation files', () => {
    assert.deepEqual(spineChapters(contents), [
      { index: 1, path: 'text/one.xhtml' },
      { index: 2, path: 'text/two.xhtml' },
    ]);
  });

  it('selects the picked chapters and always keeps navigation files translatable', () => {
    assert.deepEqual(selectChapterPaths(contents, [2]), new Set(['text/two.xhtml', 'text/nav.xhtml', 'toc.ncx']));
  });

  it('numbers chapters through a real OPF and keeps the EPUB3 nav document out', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rosetta-chapters-'));
    try {
      const path = join(dir, 'book.epub');
      await writeMultiChapterEpub(path, [xhtmlPage('<h1>Alpha</h1>'), xhtmlPage('<h1>Beta</h1>')]);
      const book = await loadBook(path);
      assert.deepEqual(spineChapters(book.contents), [
        { index: 1, path: 'OEBPS/text/chapter-1.xhtml' },
        { index: 2, path: 'OEBPS/text/chapter-2.xhtml' },
      ]);
      assert.ok(selectChapterPaths(book.contents, [1]).has('OEBPS/text/nav.xhtml'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a chapter beyond the end of the spine and says how many exist', () => {
    assert.throws(() => selectChapterPaths(contents, [9]), /chapter 9 is out of range, the book has 2 chapters/);
    assert.throws(() => selectChapterPaths([], [1]), /the book has no chapters in its spine/);
  });
});
