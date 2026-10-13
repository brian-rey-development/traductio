import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { restoreMarkup, type Tag } from '../src/epub/markup.ts';
import { parseFragment } from '../src/epub/xml.ts';

type Plan =
  | { readonly kind: 'word'; readonly word: string }
  | { readonly kind: 'empty'; readonly tag: 'br' | 'anchor' }
  | { readonly kind: 'pair'; readonly tag: 'em' | 'b' | 'sup' | 'link'; readonly children: readonly Plan[] };

type Source = { readonly encoded: string; readonly decoded: string; readonly tags: Map<string, Tag> };

const PAIRS = {
  em: { name: 'em', open: '<em>', close: '</em>' },
  b: { name: 'b', open: '<b class="x">', close: '</b>' },
  sup: { name: 'sup', open: '<sup>', close: '</sup>' },
  link: { name: 'a', open: '<a href="notes.xhtml#n1">', close: '</a>' },
} as const;

const NOISE = ['<9>', '</9>', '<1>', '</2>', '<3/>', '*', '\n', '&', '<', '"', '. '];

const { plan } = fc.letrec<{ plan: Plan; node: Plan }>((tie) => ({
  plan: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.record({
      kind: fc.constant('word' as const),
      word: fc.constantFrom('Alice', 'was', 'very', 'tired', '4', 'Mrs.'),
    }),
    fc.record({ kind: fc.constant('empty' as const), tag: fc.constantFrom('br' as const, 'anchor' as const) }),
    fc.record({
      kind: fc.constant('pair' as const),
      tag: fc.constantFrom('em' as const, 'b' as const, 'sup' as const, 'link' as const),
      children: fc.array(tie('node'), { minLength: 1, maxLength: 3 }),
    }),
  ),
  node: tie('plan'),
}));

const compile = (plans: readonly Plan[]): Source => {
  const tags = new Map<string, Tag>();
  const walk = (items: readonly Plan[]): [string, string] =>
    items.reduce<[string, string]>(
      ([encoded, decoded], item) => {
        if (item.kind === 'word') return [`${encoded}${item.word} `, `${decoded}${item.word} `];
        const id = String(tags.size + 1);
        if (item.kind === 'empty') {
          const open = item.tag === 'br' ? '<br/>' : `<a id="n${id}"/>`;
          tags.set(id, { name: item.tag === 'br' ? 'br' : 'a', open, close: '' });
          return [`${encoded}<${id}/>`, `${decoded}${open}`];
        }
        const tag = PAIRS[item.tag];
        tags.set(id, tag);
        const [inner, innerDecoded] = walk(item.children);
        return [`${encoded}<${id}>${inner}</${id}>`, `${decoded}${tag.open}${innerDecoded}${tag.close}`];
      },
      ['', ''],
    );
  const [encoded, decoded] = walk(plans);
  return { encoded, decoded, tags };
};

const source = fc.array(plan, { minLength: 1, maxLength: 6 }).map(compile);

const tokens = (encoded: string): string[] => encoded.split(/(<\/?\d+\/?>| )/).filter(Boolean);

// A model's answer is modelled as the source's own tokens, shuffled, partly dropped and mixed with junk.
const sloppyAnswer = (src: Source): fc.Arbitrary<string> =>
  fc
    .tuple(fc.shuffledSubarray(tokens(src.encoded)), fc.array(fc.constantFrom(...NOISE), { maxLength: 4 }))
    .chain(([kept, noise]) => fc.shuffledSubarray([...kept, ...noise], { minLength: kept.length + noise.length }))
    .map((parts) => parts.join(''));

const anchorIds = (markup: string): string[] => [...markup.matchAll(/id="(n\d+)"/g)].map((match) => match[1] ?? '');

describe('restoreMarkup properties', () => {
  it('always produces well-formed XHTML, whatever the model returns', () => {
    fc.assert(
      fc.property(
        source.chain((src) => fc.tuple(fc.constant(src), sloppyAnswer(src))),
        ([src, answer]) => {
          const { markup } = restoreMarkup(answer, src.encoded, src.tags);
          assert.doesNotThrow(() => parseFragment(markup, ''), markup);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('keeps every anchor exactly once, so ids stay unique and links keep working', () => {
    fc.assert(
      fc.property(
        source.chain((src) => fc.tuple(fc.constant(src), sloppyAnswer(src))),
        ([src, answer]) => {
          const expected = anchorIds(src.decoded).sort();
          assert.deepEqual(anchorIds(restoreMarkup(answer, src.encoded, src.tags).markup).sort(), expected);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('returns the original markup untouched when the model echoes the source', () => {
    fc.assert(
      fc.property(source, (src) => {
        assert.deepEqual(restoreMarkup(src.encoded, src.encoded, src.tags), { markup: src.decoded, lostTags: 0 });
      }),
      { numRuns: 1000 },
    );
  });
});
