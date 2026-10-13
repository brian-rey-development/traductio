import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { inspectBook, runDoctor, writeGlossary } from './commands.ts';
import { DEFAULTS } from './defaults.ts';
import { errorMessage } from './guards.ts';
import { readGlossary } from './glossary.ts';
import { parseLanguage } from './languages.ts';
import { translateBook, type TranslateSettings, type TranslateSummary } from './pipeline.ts';

type CliValues = {
  readonly to?: string | undefined;
  readonly from?: string | undefined;
  readonly out?: string | undefined;
  readonly model: string;
  readonly review: boolean;
  readonly 'review-model': string;
  readonly glossary?: string | undefined;
  readonly concurrency: string;
  readonly limit?: string | undefined;
  readonly api: string;
  readonly min: string;
  readonly help: boolean;
};

type Command = (input: string | undefined, values: CliValues) => Promise<boolean>;

const EPUB_EXTENSION = /\.epub$/i;
const SETTINGS = {
  apiUrl: process.env.ROSETTA_API_URL ?? DEFAULTS.apiUrl,
  translator: process.env.ROSETTA_MODEL ?? DEFAULTS.translator,
  reviewer: process.env.ROSETTA_REVIEW_MODEL ?? DEFAULTS.reviewer,
};

const USAGE = `rosetta, local EPUB translation through Ollama

Usage:
  rosetta translate <book.epub> --to <lang> [options]
  rosetta glossary  <book.epub> [--out ${DEFAULTS.glossaryFile}] [--min ${DEFAULTS.glossaryMinOccurrences}]
  rosetta inspect   <book.epub>
  rosetta doctor

Translate options:
  --to <code>          target language as an ISO code such as es, fr or de (required)
  --from <code>        source language (default: the book metadata, else ${DEFAULTS.sourceLanguage})
  --out <path>         output .epub (default: <book>.<to>.epub)
  --model <name>       translation model (default: ${SETTINGS.translator})
  --review             add a second pass where a general model edits the draft
  --review-model <m>   model for --review (default: ${SETTINGS.reviewer})
  --glossary <file>    JSON of fixed term translations, applied by --review
  --concurrency <n>    parallel requests (default: ${DEFAULTS.concurrency})
  --limit <n>          only translate the first n segments, for quick tests
  --api <url>          OpenAI-compatible server (default: ${SETTINGS.apiUrl})

Every completion is cached per book, so re-running the same command resumes.`;

const OPTIONS = {
  to: { type: 'string' },
  from: { type: 'string' },
  out: { type: 'string' },
  model: { type: 'string', default: SETTINGS.translator },
  review: { type: 'boolean', default: false },
  'review-model': { type: 'string', default: SETTINGS.reviewer },
  glossary: { type: 'string' },
  concurrency: { type: 'string', default: String(DEFAULTS.concurrency) },
  limit: { type: 'string' },
  api: { type: 'string', default: SETTINGS.apiUrl },
  min: { type: 'string', default: String(DEFAULTS.glossaryMinOccurrences) },
  help: { type: 'boolean', short: 'h', default: false },
} as const;

const parsePositiveInt = (name: string, raw: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
};

const requireEpub = (input: string | undefined): string => {
  if (!input || !EPUB_EXTENSION.test(input)) throw new Error('Pass the path to an .epub file');
  return input;
};

const outputPaths = (input: string, out: string | undefined, to: string) => {
  const output = out ?? input.replace(EPUB_EXTENSION, `.${to}.epub`);
  if (!EPUB_EXTENSION.test(output)) throw new Error('--out must end in .epub');
  if (resolve(output) === resolve(input)) throw new Error('--out must not overwrite the source book');
  return { output, reportPath: output.replace(EPUB_EXTENSION, '.report.md') };
};

const buildSettings = async (input: string, values: CliValues): Promise<TranslateSettings> => {
  if (!values.to) throw new Error('--to is required, for example --to es');
  const to = parseLanguage(values.to);
  return {
    input,
    ...outputPaths(input, values.out, to),
    from: values.from === undefined ? undefined : parseLanguage(values.from),
    to,
    translator: values.model,
    reviewer: values.review ? values['review-model'] : undefined,
    glossary: await readGlossary(values.glossary),
    concurrency: parsePositiveInt('concurrency', values.concurrency),
    limit: values.limit === undefined ? undefined : parsePositiveInt('limit', values.limit),
    apiUrl: values.api,
  };
};

const printSummary = (settings: TranslateSettings, summary: TranslateSummary): void => {
  const minutes = (summary.seconds / 60).toFixed(1);
  console.log(`Done in ${minutes} min, ${summary.segments} segments, ${summary.pair.from} → ${summary.pair.to}: ${settings.output}`);
  summary.skippedFiles.forEach(({ path, reason }) => console.log(`Skipped ${path}: ${reason}`));
  if (summary.reviewFailures > 0) console.log(`${summary.reviewFailures} reviews failed, those segments keep their first draft.`);
  if (summary.failed > 0) console.log(`${summary.failed} segments kept their original text. Re-run to retry them.`);
  if (summary.flagged > 0) console.log(`${summary.flagged} segments flagged for review: ${settings.reportPath}`);
};

const COMMANDS: Readonly<Record<string, Command>> = {
  translate: async (input, values) => {
    const settings = await buildSettings(requireEpub(input), values);
    const review = settings.reviewer ? `, reviewed by ${settings.reviewer}` : '';
    console.log(`Translating with ${settings.translator}${review}`);
    printSummary(settings, await translateBook(settings));
    return true;
  },
  glossary: async (input, values) => {
    await writeGlossary(requireEpub(input), values.out ?? DEFAULTS.glossaryFile, parsePositiveInt('min', values.min));
    return true;
  },
  inspect: async (input) => {
    await inspectBook(requireEpub(input));
    return true;
  },
  doctor: (_input, values) => runDoctor(values.api, values.model, values['review-model']),
};

const run = async (argv: readonly string[]): Promise<boolean> => {
  const { values, positionals } = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true });
  const [commandName, input] = positionals;
  if (values.help || !commandName) {
    console.log(USAGE);
    return true;
  }
  const command = COMMANDS[commandName];
  if (!command) throw new Error(`Unknown command "${commandName}". Run rosetta --help`);
  return command(input, values);
};

run(process.argv.slice(2)).then(
  (succeeded) => process.exit(succeeded ? 0 : 1),
  (error: unknown) => {
    console.error(`\nrosetta: ${errorMessage(error)}`);
    process.exit(1);
  },
);
