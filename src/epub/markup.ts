import { escapeText } from './xml.ts';

export type Tag = { readonly name: string; readonly open: string; readonly close: string };
export type TagMap = ReadonlyMap<string, Tag>;
type Restored = { readonly markup: string; readonly lostTags: number };

type Token =
  { readonly kind: 'text'; readonly text: string } | { readonly kind: 'open' | 'close' | 'empty'; readonly id: string };

type RenderedTokens = { readonly markup: string; readonly used: Set<string> };

const PLACEHOLDER = /<\/?\d+\/?>/g;
const EMPTY_PLACEHOLDER = /<\d+\/>/g;
const ASCII_WHITESPACE = /[ \t\n\r\f]+/g;
const ID_ATTRIBUTE = / id="/;
const PLACEHOLDER_SPLIT = /(<\/?\d+\/?>)/;
const PLACEHOLDER_PARTS = /^<(\/?)(\d+)(\/?)>$/;
const LINE_BREAK = /\s*\n\s*/;
const MARKDOWN_EMPHASIS = /\*([^*\n]+)\*/g;
const EMPHASIS_TAGS = new Set(['cite', 'em', 'i']);
const NOTE_TAGS = new Set(['a', 'sup']);
const NOTE_MARK = /^\s*[\d*†‡§]+\s*$/;
const SENTENCE_END = /[.!?…]+(?:["'”’»)\]]|<\/\d+>)*(?=\s|<|$)/g;
const ABBREVIATION = /(?:^|[\s(])(?:[A-Z]|Mr|Mrs|Ms|Dr|Jr|Sr|St|Sra|Srta|Dra)$/;
const LETTER = /\p{L}/u;

type Note = { readonly id: string; readonly mark: string; readonly at: number };

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
  [...tags].filter(([id, tag]) => isEmptyTag(tag) && !translated.includes(emptyPlaceholder(id))).map(([id]) => id);

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
  [...tags].filter(([id, tag]) => !isEmptyTag(tag) && !translated.includes(`<${id}>`)).map(([id]) => id);

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

const sentenceEnds = (text: string): number[] => {
  const ends = [...text.matchAll(SENTENCE_END)]
    .filter((match) => !ABBREVIATION.test(text.slice(0, match.index)))
    .map((match) => match.index + match[0].length);
  return LETTER.test(text.slice(ends.at(-1) ?? 0)) ? [...ends, text.length] : ends;
};

const noteMark = (source: string, id: string): string | undefined =>
  new RegExp(`<${id}>([^<]*)</${id}>`).exec(source)?.[1];

const missingNotes = (translated: string, source: string, tags: TagMap): Note[] =>
  missingPairedIds(translated, tags).flatMap((id) => {
    const mark = NOTE_TAGS.has(tags.get(id)?.name ?? '') ? noteMark(source, id) : undefined;
    return mark !== undefined && NOTE_MARK.test(mark) ? [{ id, mark, at: source.indexOf(`<${id}>`) }] : [];
  });

const noteOffset = (note: Note, sourceEnds: readonly number[], translatedEnds: readonly number[]): number => {
  const sentence = sourceEnds.filter((end) => end < note.at).length + 1;
  const index = Math.round((sentence * translatedEnds.length) / Math.max(sourceEnds.length, 1));
  return translatedEnds[Math.min(Math.max(index, 1), translatedEnds.length) - 1] ?? 0;
};

// Models drop endnote markers and often start a new paragraph where they were, so a dropped
// marker goes back after the sentence that ended in the same relative place in the translation.
const reinsertNotes = (translated: string, source: string, tags: TagMap): string => {
  const notes = missingNotes(translated, source, tags);
  if (notes.length === 0) return translated;
  const sourceEnds = sentenceEnds(source);
  const translatedEnds = sentenceEnds(translated);
  return notes
    .map((note) => ({ note, offset: noteOffset(note, sourceEnds, translatedEnds) }))
    .reverse()
    .reduce(
      (text, { note, offset }) => `${text.slice(0, offset)}<${note.id}>${note.mark}</${note.id}>${text.slice(offset)}`,
      translated,
    );
};

const closingTags = (openTags: Tag[]): string =>
  openTags
    .reverse()
    .map((tag) => tag.close)
    .join('');

const renderTokens = (tokens: readonly Token[], tags: TagMap): RenderedTokens => {
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
  return { markup: markup + closingTags(openTags), used };
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
  const withBreaks = lineBreaksToPlaceholders(translated, tags);
  const normalized = reinsertNotes(markdownEmphasisToPlaceholders(withBreaks, source, tags), source, tags);
  const tokens = normalized.split(PLACEHOLDER_SPLIT).filter(Boolean).map(toToken);
  const { markup, used } = renderTokens(tokens, tags);
  const lostTags = [...tags].filter(([id, tag]) => !isEmptyTag(tag) && !used.has(id)).length;
  return { markup: reinsertEmptyElements(markup, source, tags, used), lostTags };
};
