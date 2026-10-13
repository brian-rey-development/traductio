import { escapeText } from './xml.ts';

export type Tag = { readonly name: string; readonly open: string; readonly close: string };
export type TagMap = ReadonlyMap<string, Tag>;
export type Restored = { readonly markup: string; readonly lostTags: number };

type Token =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'open' | 'close' | 'empty'; readonly id: string };

const PLACEHOLDER = /<\/?\d+\/?>/g;
const EMPTY_PLACEHOLDER = /<\d+\/>/g;
const ASCII_WHITESPACE = /[ \t\n\r\f]+/g;
const ID_ATTRIBUTE = / id="/;
const PLACEHOLDER_SPLIT = /(<\/?\d+\/?>)/;
const PLACEHOLDER_PARTS = /^<(\/?)(\d+)(\/?)>$/;
const LINE_BREAK = /\s*\n\s*/;
const MARKDOWN_EMPHASIS = /\*([^*\n]+)\*/g;
const EMPHASIS_TAGS = new Set(['cite', 'em', 'i']);

export const normalizeSpace = (text: string): string => text.replace(ASCII_WHITESPACE, ' ').trim();

export const stripPlaceholders = (text: string): string => text.replace(PLACEHOLDER, '').trim();

export const toPlainText = (encoded: string): string =>
  normalizeSpace(encoded.replace(EMPTY_PLACEHOLDER, ' ').replace(PLACEHOLDER, ''));

export const isEmptyTag = (tag: Tag): boolean => tag.close === '';

export const isAnchor = (tag: Tag): boolean => isEmptyTag(tag) && ID_ATTRIBUTE.test(tag.open);

export const hasPairedTags = (tags: TagMap): boolean => [...tags.values()].some((tag) => !isEmptyTag(tag));

const emptyPlaceholder = (id: string): string => `<${id}/>`;

const toToken = (part: string): Token => {
  const match = PLACEHOLDER_PARTS.exec(part);
  if (!match) return { kind: 'text', text: part };
  const [, closing, id = '', selfClosing] = match;
  if (closing) return { kind: 'close', id };
  return { kind: selfClosing ? 'empty' : 'open', id };
};

const missingEmptyIds = (translated: string, tags: TagMap): string[] =>
  [...tags]
    .filter(([id, tag]) => isEmptyTag(tag) && !translated.includes(emptyPlaceholder(id)))
    .map(([id]) => id);

const lineBreaksToPlaceholders = (translated: string, tags: TagMap): string => {
  const missingBreaks = missingEmptyIds(translated, tags).filter((id) => tags.get(id)?.name === 'br');
  const [first = '', ...rest] = translated.split(LINE_BREAK);
  let result = first;
  rest.forEach((line, index) => {
    const breakId = missingBreaks[index];
    result += (breakId ? emptyPlaceholder(breakId) : ' ') + line;
  });
  return result;
};

const missingPairedIds = (translated: string, tags: TagMap): string[] =>
  [...tags]
    .filter(([id, tag]) => !isEmptyTag(tag) && !translated.includes(`<${id}>`))
    .map(([id]) => id);

// Models sometimes write *Emma* instead of keeping the placeholder, which would leave literal asterisks in the book.
const markdownEmphasisToPlaceholders = (translated: string, source: string, tags: TagMap): string => {
  if (source.includes('*')) return translated;
  const missing = missingPairedIds(translated, tags).filter((id) => EMPHASIS_TAGS.has(tags.get(id)?.name ?? ''));
  let next = 0;
  return translated.replace(MARKDOWN_EMPHASIS, (_match, inner: string) => {
    const id = missing[next++];
    return id ? `<${id}>${inner}</${id}>` : inner;
  });
};

const renderTokens = (tokens: readonly Token[], tags: TagMap): { markup: string; used: Set<string> } => {
  const used = new Set<string>();
  const openTags: Tag[] = [];
  let markup = '';
  for (const token of tokens) {
    if (token.kind === 'text') markup += escapeText(token.text);
    else if (token.kind === 'close') markup += openTags.pop()?.close ?? '';
    else {
      const tag = tags.get(token.id);
      const kindMatches = tag !== undefined && (token.kind === 'empty') === isEmptyTag(tag);
      if (!tag || !kindMatches || used.has(token.id)) continue;
      used.add(token.id);
      markup += tag.open;
      if (token.kind === 'open') openTags.push(tag);
    }
  }
  return { markup: markup + openTags.reverse().map((tag) => tag.close).join(''), used };
};

const reinsertEmptyElements = (markup: string, source: string, tags: TagMap, used: Set<string>): string => {
  const missing = [...tags].filter(([id, tag]) => isEmptyTag(tag) && !used.has(id));
  const isLeading = (id: string): boolean => source.indexOf(emptyPlaceholder(id)) < source.length / 2;
  const leading = missing.filter(([id]) => isLeading(id)).map(([, tag]) => tag.open);
  const trailing = missing.filter(([id]) => !isLeading(id)).map(([, tag]) => tag.open);
  return leading.join('') + markup + trailing.join('');
};

// Models often renumber or drop placeholders, so closing tags are matched by nesting order
// rather than by id, which is safe because the source XHTML cannot contain overlapping tags.
export const restoreMarkup = (translated: string, source: string, tags: TagMap): Restored => {
  const normalized = markdownEmphasisToPlaceholders(lineBreaksToPlaceholders(translated, tags), source, tags);
  const tokens = normalized.split(PLACEHOLDER_SPLIT).filter(Boolean).map(toToken);
  const { markup, used } = renderTokens(tokens, tags);
  const lostTags = [...tags].filter(([id, tag]) => !isEmptyTag(tag) && !used.has(id)).length;
  return { markup: reinsertEmptyElements(markup, source, tags, used), lostTags };
};
