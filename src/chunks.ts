import { scriptDensity } from './languages.ts';

// About 700 tokens of English, well inside TranslateGemma's 2K-token input window and the server's 4096 context.
const MAX_CHUNK_CHARS = 2400;

export const chunkLimit = (language: string): number => Math.round(MAX_CHUNK_CHARS * scriptDensity(language));

const groupSentences = (sentences: readonly string[], limit: number): string[] => {
  const groups: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > limit) {
      groups.push(current);
      current = '';
    }
    current += sentence;
  }
  if (current) groups.push(current);
  return groups;
};

export const splitLongText = (text: string, language: string): string[] => {
  const limit = chunkLimit(language);
  if (text.length <= limit) return [text];
  const segmenter = new Intl.Segmenter(language, { granularity: 'sentence' });
  const sentences = Array.from(segmenter.segment(text), (part) => part.segment);
  return groupSentences(sentences, limit).map((group) => group.trim()).filter(Boolean);
};
