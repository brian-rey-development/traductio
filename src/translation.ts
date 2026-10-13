import type { Node } from '@xmldom/xmldom';
import { checkTranslation, type Flag } from './checks.ts';
import { chunkLimit, splitLongText } from './chunks.ts';
import type { LanguagePair } from './languages.ts';
import { hasPairedTags, isAnchor, restoreMarkup, stripPlaceholders } from './markup.ts';
import { cleanCompletion, reviewPrompt, translationPrompt, type Glossary } from './prompts.ts';
import { replaceSegmentContent, type Segment } from './segments.ts';
import { ownerDocumentOf, parseFragment } from './xml.ts';

export type Engine = {
  readonly complete: (prompt: string) => Promise<string>;
  readonly pair: LanguagePair;
  readonly glossary: Glossary;
};

export type Draft =
  | { readonly kind: 'markup'; readonly encoded: string; readonly markup: string; readonly flags: readonly Flag[] }
  | { readonly kind: 'plain'; readonly text: string; readonly flags: readonly Flag[] };

const MIN_REVISION_RATIO = 0.6;
const MAX_REVISION_RATIO = 1.6;
const ENDS_WITH_PUNCTUATION = /[.!?…:;,"”’»)\]]$/u;

// TranslateGemma ends nearly every output with a period, which is wrong for headings, titles and list items.
const dropAddedPeriod = (source: string, translated: string): string => {
  const periodWasAdded = !ENDS_WITH_PUNCTUATION.test(stripPlaceholders(source)) && translated.endsWith('.');
  return periodWasAdded && !translated.endsWith('...') ? translated.slice(0, -1) : translated;
};

const translateText = async (text: string, engine: Engine): Promise<string> => {
  const translated = cleanCompletion(await engine.complete(translationPrompt(text, engine.pair)));
  return dropAddedPeriod(text, translated);
};

const translateInChunks = async (text: string, engine: Engine): Promise<string> => {
  const translated: string[] = [];
  for (const chunk of splitLongText(text, engine.pair.from)) translated.push(await translateText(chunk, engine));
  return translated.join(' ');
};

const markupDraft = (segment: Segment, encoded: string): Draft => {
  const { markup, lostTags } = restoreMarkup(encoded, segment.encoded, segment.tags);
  return { kind: 'markup', encoded, markup, flags: lostTags > 0 ? ['markup-lost'] : [] };
};

export const draftSegment = async (segment: Segment, engine: Engine): Promise<Draft> => {
  const fitsOneRequest = segment.encoded.length <= chunkLimit(engine.pair.from);
  if (segment.tags.size > 0 && fitsOneRequest) {
    return markupDraft(segment, await translateText(segment.encoded, engine));
  }
  const flags: Flag[] = hasPairedTags(segment.tags) ? ['markup-lost'] : [];
  return { kind: 'plain', text: await translateInChunks(segment.plain, engine), flags };
};

export const visibleText = (draft: Draft): string =>
  draft.kind === 'markup' ? stripPlaceholders(draft.encoded) : draft.text;

const isAcceptableRevision = (draft: Draft, revised: Draft): boolean => {
  const ratio = visibleText(revised).length / Math.max(1, visibleText(draft).length);
  const withinLength = ratio >= MIN_REVISION_RATIO && ratio <= MAX_REVISION_RATIO;
  return withinLength && revised.flags.length <= draft.flags.length;
};

export const reviewDraft = async (segment: Segment, draft: Draft, engine: Engine): Promise<Draft> => {
  const [source, current] = draft.kind === 'markup' ? [segment.encoded, draft.encoded] : [segment.plain, draft.text];
  if (source.length > chunkLimit(engine.pair.from)) return draft;
  const prompt = reviewPrompt(source, current, engine.pair, engine.glossary);
  const revision = cleanCompletion(await engine.complete(prompt));
  const revised = draft.kind === 'markup' ? markupDraft(segment, revision) : { ...draft, text: revision };
  return isAcceptableRevision(draft, revised) ? revised : draft;
};

export const draftFlags = (segment: Segment, draft: Draft, pair: LanguagePair): Flag[] => [
  ...draft.flags,
  ...checkTranslation(segment.plain, visibleText(draft), pair),
];

const plainReplacement = (segment: Segment, text: string): Node[] => {
  const anchors = [...segment.tags.values()].filter(isAnchor);
  const anchorNodes = anchors.flatMap((tag) => parseFragment(tag.open, segment.namespaces));
  return [...anchorNodes, ownerDocumentOf(segment.parent).createTextNode(text)];
};

export const applyDraft = (segment: Segment, draft: Draft): void => {
  const replacement =
    draft.kind === 'markup' ? parseFragment(draft.markup, segment.namespaces) : plainReplacement(segment, draft.text);
  replaceSegmentContent(segment, replacement);
};
