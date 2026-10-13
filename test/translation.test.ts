import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findXhtmlSegments, type Segment } from '../src/epub/segments.ts';
import { serialize } from '../src/epub/xml.ts';
import {
  applyDraft,
  draftFlags,
  draftSegment,
  reviewDraft,
  visibleText,
  type Draft,
  type Engine,
} from '../src/translate/translation.ts';
import { parsePage } from './helpers.ts';

const EN_ES = { from: 'en', to: 'es' };

const engine = (respond: (prompt: string) => string): Engine => ({
  complete: (prompt) => Promise.resolve(respond(prompt)),
  pair: EN_ES,
  glossary: {},
});

const onlySegment = (body: string): Segment => {
  const segments = findXhtmlSegments('chapter.xhtml', parsePage(body));
  assert.equal(segments.length, 1);
  return segments[0] ?? assert.fail('expected one segment');
};

const lastLine = (prompt: string): string => prompt.split('\n').at(-1) ?? '';

describe('draftSegment', () => {
  it('drops the period the model adds to headings but keeps real sentence periods', async () => {
    const heading = await draftSegment(
      onlySegment('<h1>Chapter One</h1>'),
      engine(() => 'Capítulo Uno.'),
    );
    assert.equal(visibleText(heading), 'Capítulo Uno');
    const sentence = await draftSegment(
      onlySegment('<p>Alice was tired.</p>'),
      engine(() => 'Alicia estaba cansada.'),
    );
    assert.equal(visibleText(sentence), 'Alicia estaba cansada.');
  });

  it('keeps inline markup through the placeholder round trip', async () => {
    const segment = onlySegment('<p>Alice was <em>very</em> tired.</p>');
    const draft = await draftSegment(
      segment,
      engine((prompt) => lastLine(prompt).replace('tired', 'cansada')),
    );
    assert.equal(draft.kind, 'markup');
    assert.deepEqual(draft.flags, []);
    applyDraft(segment, draft);
    assert.ok(serialize(segment.parent).includes('<em>very</em> cansada'), serialize(segment.parent));
  });

  it('flags a draft whose formatting pair the model dropped', async () => {
    const segment = onlySegment('<p>Alice was <em>very</em> tired today.</p>');
    const draft = await draftSegment(
      segment,
      engine(() => 'Alicia estaba muy cansada hoy'),
    );
    assert.ok(draftFlags(segment, draft, EN_ES).includes('markup-lost'));
  });
});

describe('reviewDraft', () => {
  const plainDraft: Draft = { kind: 'plain', text: 'Alicia estaba cansada hoy', flags: [] };

  it('accepts a revision of sane length and rejects one that guts the text', async () => {
    const segment = onlySegment('<p>Alice was tired today.</p>');
    const accepted = await reviewDraft(
      segment,
      plainDraft,
      engine(() => 'Alicia estaba muy cansada hoy'),
    );
    assert.equal(visibleText(accepted), 'Alicia estaba muy cansada hoy');
    const rejected = await reviewDraft(
      segment,
      plainDraft,
      engine(() => 'Cansada'),
    );
    assert.equal(visibleText(rejected), 'Alicia estaba cansada hoy');
  });

  it('skips the review entirely when the source exceeds one request', async () => {
    const longSegment = onlySegment(`<p>${'word '.repeat(800)}</p>`);
    let calls = 0;
    const counting: Engine = {
      complete: () => {
        calls += 1;
        return Promise.resolve('revision');
      },
      pair: EN_ES,
      glossary: {},
    };
    const unchanged = await reviewDraft(longSegment, plainDraft, counting);
    assert.equal(unchanged, plainDraft);
    assert.equal(calls, 0);
  });
});
