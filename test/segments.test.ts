import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findNcxSegments, findXhtmlSegments, replaceSegmentContent } from '../src/segments.ts';
import { parseFragment, parseXml, serialize } from '../src/xml.ts';
import { parsePage } from './helpers.ts';

const sources = (body: string): string[] => findXhtmlSegments('x', parsePage(body)).map((segment) => segment.encoded);

describe('findXhtmlSegments', () => {
  it('encodes inline elements of leaf blocks and skips text without letters', () => {
    assert.deepEqual(sources('<div><p>Hello <em>dear</em> reader<a id="n1"/></p><p> 42 </p></div>'), [
      'Hello <1>dear</1> reader<2/>',
    ]);
  });

  it('keeps text that sits beside nested blocks or empty blocks', () => {
    const body = '<ul><li>Item <i>one</i><ul><li>Nested</li></ul> tail</li></ul><div>Intro<div class="spacer"/></div>';
    assert.deepEqual(sources(body), ['Item <1>one</1>', 'Nested', 'tail', 'Intro']);
  });

  it('leaves preformatted and script content alone', () => {
    assert.deepEqual(sources('<div>Text<pre>code here</pre></div>'), ['Text']);
  });

  it('preserves non-breaking spaces from HTML entities', () => {
    const [segment] = findXhtmlSegments('x', parsePage('<p>Mr.&nbsp;Darcy</p>'));
    assert.equal(segment?.plain, 'Mr. Darcy');
  });
});

describe('replaceSegmentContent', () => {
  it('replaces only the nodes of a mixed-content run', () => {
    const doc = parsePage('<li>Item<ul><li>Nested</li></ul></li>');
    const [item] = findXhtmlSegments('x', doc);
    if (!item) throw new Error('fixture has no segment');
    replaceSegmentContent(item, parseFragment('Elemento', item.namespaces));
    assert.match(serialize(doc), /<li>Elemento<ul><li>Nested<\/li><\/ul><\/li>/);
  });

  it('parses translations that use namespace prefixes declared on the root', () => {
    const doc = parsePage('<p>See<ops:note ops:id="n"/> here</p>', ' xmlns:ops="http://www.idpf.org/2007/ops"');
    const [segment] = findXhtmlSegments('x', doc);
    if (!segment) throw new Error('fixture has no segment');
    replaceSegmentContent(segment, parseFragment('Ver<ops:note ops:id="n"/> aquí', segment.namespaces));
    assert.match(serialize(doc), /<p>Ver<ops:note ops:id="n"\/> aquí<\/p>/);
  });
});

describe('findNcxSegments', () => {
  it('translates navigation labels', () => {
    const ncx = parseXml(
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>Chapter One</text></navLabel></navPoint></navMap></ncx>',
      'application/xml',
    );
    assert.deepEqual(findNcxSegments('toc.ncx', ncx).map((segment) => segment.plain), ['Chapter One']);
  });
});
