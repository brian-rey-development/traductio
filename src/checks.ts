import { expectedLengthRatio, type LanguagePair } from './languages.ts';

export type Flag = 'failed' | 'empty' | 'too-short' | 'too-long' | 'untranslated' | 'markup-lost';

const MIN_RATIO = 0.5;
const MAX_RATIO = 2.2;
const MIN_LENGTH_FOR_RATIO = 40;

export const checkTranslation = (source: string, translated: string, pair: LanguagePair): Flag[] => {
  if (translated.trim().length === 0) return ['empty'];
  if (source.length < MIN_LENGTH_FOR_RATIO) return [];
  if (source === translated) return ['untranslated'];
  const ratio = translated.length / source.length / expectedLengthRatio(pair);
  if (ratio < MIN_RATIO) return ['too-short'];
  return ratio > MAX_RATIO ? ['too-long'] : [];
};
