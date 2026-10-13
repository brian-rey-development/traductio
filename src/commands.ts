import { writeFile } from 'node:fs/promises';
import { collectSegments, loadDocuments } from './documents.ts';
import { bookLanguage, loadBook } from './epub.ts';
import { extractGlossary } from './glossary.ts';
import { createClient, isModelInstalled } from './llm.ts';

const CHARS_PER_TOKEN = 4;

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
  console.log(`Approx. tokens:  ${Math.round(characters / CHARS_PER_TOKEN).toLocaleString('en')}`);
};

export const writeGlossary = async (input: string, output: string, minOccurrences: number): Promise<void> => {
  const { documents } = await loadDocuments(await loadBook(input));
  const glossary = extractGlossary(collectSegments(documents).map((segment) => segment.plain), minOccurrences);
  await writeFile(output, `${JSON.stringify(glossary, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(glossary).length} terms to ${output}. Edit the translations, then pass --glossary ${output}`);
};

export const runDoctor = async (apiUrl: string, translator: string, reviewer: string): Promise<boolean> => {
  const installed = await createClient(apiUrl).listModels().catch(() => undefined);
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
