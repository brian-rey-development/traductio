import { languageName, type LanguagePair } from './languages.ts';

export type Glossary = Readonly<Record<string, string>>;

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/g;
const QWEN3_PREFIX = 'qwen3';
const QWEN3_NO_THINK = '/no_think';
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

// Verbatim TranslateGemma prompt from its model card, which the model was trained on, so nothing is added to it.
export const translationPrompt = (text: string, { from, to }: LanguagePair): string => {
  const source = languageName(from);
  const target = languageName(to);
  return [
    `You are a professional ${source} (${from}) to ${target} (${to}) translator. Your goal is to accurately convey the meaning and nuances of the original ${source} text while adhering to ${target} grammar, vocabulary, and cultural sensitivities.`,
    `Produce only the ${target} translation, without any additional explanations or commentary. Please translate the following ${source} text into ${target}:`,
    '',
    '',
    text,
  ].join('\n');
};

const wordPatterns = new Map<string, RegExp>();

const wordPattern = (term: string): RegExp => {
  const cached = wordPatterns.get(term);
  if (cached) return cached;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(REGEX_SPECIAL, '\\$&')}(?![\\p{L}\\p{N}])`, 'u');
  wordPatterns.set(term, pattern);
  return pattern;
};

const containsWord = (text: string, term: string): boolean => wordPattern(term).test(text);

const glossaryLines = (source: string, glossary: Glossary): string[] =>
  Object.entries(glossary)
    .filter(([term]) => containsWord(source, term))
    .map(([term, translation]) => `- ${term} => ${translation}`);

export const reviewPrompt = (source: string, draft: string, { from, to }: LanguagePair, glossary: Glossary): string => {
  const sourceName = languageName(from);
  const target = languageName(to);
  const terms = glossaryLines(source, glossary);
  return [
    `You are an expert ${target} literary editor reviewing a translation from ${sourceName}.`,
    `Compare the draft against the original. Fix mistranslations, omitted or added content, and unnatural ${target} phrasing, while keeping the author's tone and the draft's wording wherever it is already correct.`,
    'Keep every numbered tag such as <1>, </1> or <2/> exactly as in the draft, around the matching words.',
    ...(terms.length > 0 ? ['Use these fixed translations for terms:', ...terms] : []),
    `Reply with only the final ${target} text, with no notes or quotation marks.`,
    '',
    `ORIGINAL (${sourceName}):`,
    source,
    '',
    `DRAFT (${target}):`,
    draft,
  ].join('\n');
};

// Qwen3 reasons at length before answering unless the prompt ends with its documented switch.
export const adaptPromptToModel = (model: string, prompt: string): string =>
  model.startsWith(QWEN3_PREFIX) ? `${prompt}\n${QWEN3_NO_THINK}` : prompt;

export const cleanCompletion = (text: string): string => text.replace(THINK_BLOCK, '').trim();
