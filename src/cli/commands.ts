import { writeFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { collectSegments, loadDocuments } from '../epub/documents.ts';
import { bookLanguage, loadBook, type ContentFile } from '../epub/book.ts';
import { spineChapters } from '../epub/chapters.ts';
import type { Segment } from '../epub/segments.ts';
import { extractGlossary } from '../translate/glossary.ts';
import { createClient, isModelInstalled } from '../llm/client.ts';

const ESTIMATED_CHARS_PER_TOKEN = 4;
const MAX_TITLE_CHARS = 60;

const chapterTitle = (segments: readonly Segment[], path: string): string => {
  const first = segments[0]?.plain.trim();
  if (!first) return posix.basename(path);
  return first.length > MAX_TITLE_CHARS ? `${first.slice(0, MAX_TITLE_CHARS).trimEnd()}…` : first;
};

const printChapters = (contents: readonly ContentFile[], segments: readonly Segment[]): void => {
  const byPath = new Map<string, Segment[]>();
  segments.forEach((segment) => {
    const own = byPath.get(segment.path) ?? [];
    own.push(segment);
    byPath.set(segment.path, own);
  });
  const chapters = spineChapters(contents);
  if (chapters.length === 0) return;
  console.log('Chapters:');
  chapters.forEach(({ index, path }) => {
    const own = byPath.get(path) ?? [];
    console.log(`  ${index}. ${chapterTitle(own, path)} (${own.length} segments)`);
  });
};

export const inspectBook = async (input: string): Promise<void> => {
  const book = await loadBook(input);
  const { documents, skipped } = await loadDocuments(book);
  const segments = collectSegments(documents);
  const characters = segments.reduce((total, segment) => total + segment.plain.length, 0);
  const withMarkup = segments.filter((segment) => segment.tags.size > 0).length;
  console.log(`Language:        ${bookLanguage(book) ?? 'unknown'}`);
  console.log(`Content files:   ${documents.length}${skipped.length > 0 ? ` (${skipped.length} unreadable)` : ''}`);
  console.log(`Segments:        ${segments.length} (${withMarkup} with inline formatting)`);
  console.log(`Characters:      ${characters.toLocaleString('en')}`);
  console.log(`Approx. tokens:  ${Math.round(characters / ESTIMATED_CHARS_PER_TOKEN).toLocaleString('en')}`);
  printChapters(book.contents, segments);
};

export const writeGlossary = async (input: string, output: string, minOccurrences: number): Promise<void> => {
  const { documents } = await loadDocuments(await loadBook(input));
  const glossary = extractGlossary(
    collectSegments(documents).map((segment) => segment.plain),
    minOccurrences,
  );
  await writeFile(output, `${JSON.stringify(glossary, null, 2)}\n`);
  console.log(
    `Wrote ${Object.keys(glossary).length} terms to ${output}. Edit the translations, then pass --glossary ${output}`,
  );
};

export const runDoctor = async (apiUrl: string, translator: string, reviewer: string): Promise<boolean> => {
  const installed = await createClient(apiUrl)
    .listModels()
    .catch(() => undefined);
  if (!installed) {
    console.log(`✗ No model server at ${apiUrl}. Run scripts/setup.sh or start Ollama.`);
    return false;
  }
  console.log(`✓ Model server reachable at ${apiUrl}`);
  const report = (model: string, note: string): boolean => {
    const ok = isModelInstalled(installed, model);
    console.log(`${ok ? '✓' : '✗'} ${model} ${note}${ok ? '' : `, install with: ollama pull ${model}`}`);
    return ok;
  };
  const translatorReady = report(translator, '(translation)');
  report(reviewer, '(optional, used by --review)');
  return translatorReady;
};
