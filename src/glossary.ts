import { readFile } from 'node:fs/promises';
import { isRecord } from './guards.ts';
import type { Glossary } from './prompts.ts';

const CAPITALIZED_PHRASE = /\p{Lu}\p{Ll}+(?:\s\p{Lu}\p{Ll}+)*/gu;
const SENTENCE_OPENER = /(?:^|[.!?…:]["”’»)]?\s+|["“«‘(]\s*)$/u;
const LOOKBEHIND_CHARS = 4;
const MAX_TERMS = 300;

// Capitalized words that open a sentence say nothing about names, so only mid-sentence ones are counted.
const opensSentence = (text: string, index: number): boolean =>
  SENTENCE_OPENER.test(text.slice(Math.max(0, index - LOOKBEHIND_CHARS), index));

const countTerms = (texts: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const { 0: term, index } of text.matchAll(CAPITALIZED_PHRASE)) {
      if (!opensSentence(text, index)) counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return counts;
};

export const extractGlossary = (texts: readonly string[], minOccurrences: number): Glossary => {
  const frequent = [...countTerms(texts)]
    .filter(([, count]) => count >= minOccurrences)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_TERMS);
  return Object.fromEntries(frequent.map(([term]) => [term, term]));
};

const isGlossary = (value: unknown): value is Glossary =>
  isRecord(value) && Object.values(value).every((translation) => typeof translation === 'string');

export const readGlossary = async (path: string | undefined): Promise<Glossary> => {
  if (!path) return {};
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isGlossary(parsed)) throw new Error(`${path} must be a JSON object mapping terms to translations`);
  return parsed;
};
