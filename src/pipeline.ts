import { cachePathFor, openCache } from './cache.ts';
import { createCompleter, type Completer } from './completer.ts';
import { DEFAULTS } from './defaults.ts';
import {
  collectSegments,
  loadDocuments,
  serializeDocuments,
  setLanguage,
  type ContentDocument,
  type SkippedFile,
} from './documents.ts';
import { bookLanguage, loadBook, writeBook, type Book } from './epub.ts';
import { errorMessage } from './guards.ts';
import { parseLanguage, type LanguagePair } from './languages.ts';
import { assertModelsInstalled, createClient } from './llm.ts';
import { runPool } from './pool.ts';
import { createProgress } from './progress.ts';
import { adaptPromptToModel, type Glossary } from './prompts.ts';
import { writeReport, type FlaggedSegment } from './report.ts';
import type { Segment } from './segments.ts';
import { applyDraft, draftFlags, draftSegment, reviewDraft, visibleText, type Draft, type Engine } from './translation.ts';

export type TranslateSettings = {
  readonly input: string;
  readonly output: string;
  readonly reportPath: string;
  readonly from: string | undefined;
  readonly to: string;
  readonly translator: string;
  readonly reviewer: string | undefined;
  readonly glossary: Glossary;
  readonly concurrency: number;
  readonly limit: number | undefined;
  readonly apiUrl: string;
};

export type TranslateSummary = {
  readonly pair: LanguagePair;
  readonly segments: number;
  readonly flagged: number;
  readonly failed: number;
  readonly reviewFailures: number;
  readonly skippedFiles: readonly SkippedFile[];
  readonly seconds: number;
};

type Run = {
  readonly settings: TranslateSettings;
  readonly pair: LanguagePair;
  readonly book: Book;
  readonly documents: readonly ContentDocument[];
  readonly skippedFiles: readonly SkippedFile[];
  readonly segments: readonly Segment[];
  readonly completer: Completer;
};

type Failures = ReadonlyMap<Segment, string>;
type PhaseResult<R> = { readonly results: ReadonlyMap<Segment, R>; readonly failures: Failures };
type PhaseOptions = { readonly label: string; readonly stopOnFailureStreak: boolean };
type PhaseWork<R> = (segment: Segment) => Promise<R>;
type Settled<R> = { readonly ok: true; readonly value: R } | { readonly ok: false; readonly error: unknown };

const MAX_FAILURE_STREAK = 5;
const MS_PER_SECOND = 1000;
const TRANSLATE_PHASE: PhaseOptions = { label: 'Translating', stopOnFailureStreak: true };
const REVIEW_PHASE: PhaseOptions = { label: 'Reviewing', stopOnFailureStreak: false };

const startRun = async (settings: TranslateSettings): Promise<Run> => {
  const client = createClient(settings.apiUrl);
  const models = settings.reviewer ? [settings.translator, settings.reviewer] : [settings.translator];
  await assertModelsInstalled(client, settings.apiUrl, models);
  const book = await loadBook(settings.input);
  const from = parseLanguage(settings.from ?? bookLanguage(book) ?? DEFAULTS.sourceLanguage);
  const { documents, skipped } = await loadDocuments(book);
  const segments = collectSegments(documents).slice(0, settings.limit);
  const completer = createCompleter(client, await openCache(cachePathFor(book.id)));
  return { settings, pair: { from, to: settings.to }, book, documents, skippedFiles: skipped, segments, completer };
};

const engineFor = (run: Run, model: string): Engine => ({
  complete: (prompt) => run.completer.complete(model, adaptPromptToModel(model, prompt)),
  pair: run.pair,
  glossary: run.settings.glossary,
});

const settle = async <R>(task: () => Promise<R>): Promise<Settled<R>> => {
  try {
    return { ok: true, value: await task() };
  } catch (error) {
    return { ok: false, error };
  }
};

const createFailureStreak = (enabled: boolean) => {
  let streak = 0;
  return (outcome: Settled<unknown>): void => {
    streak = outcome.ok ? 0 : streak + 1;
    if (!outcome.ok && enabled && streak >= MAX_FAILURE_STREAK) {
      throw new Error(`Stopping after ${streak} failed requests in a row. Last error: ${errorMessage(outcome.error)}`);
    }
  };
};

const runPhase = async <R>(
  run: Run,
  options: PhaseOptions,
  segments: readonly Segment[],
  work: PhaseWork<R>,
): Promise<PhaseResult<R>> => {
  const results = new Map<Segment, R>();
  const failures = new Map<Segment, string>();
  const progress = createProgress(options.label, segments.length, run.completer.modelCalls);
  const trackStreak = createFailureStreak(options.stopOnFailureStreak);
  await runPool(segments, run.settings.concurrency, async (segment) => {
    const outcome = await settle(() => work(segment));
    progress.tick();
    if (outcome.ok) results.set(segment, outcome.value);
    else failures.set(segment, errorMessage(outcome.error));
    trackStreak(outcome);
  });
  progress.done();
  return { results, failures };
};

const reviewDrafts = async (run: Run, reviewer: string, drafts: ReadonlyMap<Segment, Draft>) => {
  const engine = engineFor(run, reviewer);
  const reviewDraftOf = async (segment: Segment): Promise<Draft> => {
    const draft = drafts.get(segment);
    if (!draft) throw new Error('Segment has no draft to review');
    return reviewDraft(segment, draft, engine);
  };
  const { results, failures } = await runPhase(run, REVIEW_PHASE, [...drafts.keys()], reviewDraftOf);
  return { drafts: new Map([...drafts, ...results]), reviewFailures: failures.size };
};

const applyDrafts = (drafts: ReadonlyMap<Segment, Draft>): Failures => {
  const failures = new Map<Segment, string>();
  drafts.forEach((draft, segment) => {
    try {
      applyDraft(segment, draft);
    } catch (error) {
      failures.set(segment, `Could not insert the translation: ${errorMessage(error)}`);
    }
  });
  return failures;
};

const flagSegment = (run: Run, segment: Segment, draft: Draft | undefined, error: string | undefined) => {
  if (error !== undefined || draft === undefined) {
    return { segment, flags: ['failed'], translation: '', error } satisfies FlaggedSegment;
  }
  return { segment, flags: draftFlags(segment, draft, run.pair), translation: visibleText(draft) } satisfies FlaggedSegment;
};

const writeOutputs = async (run: Run, drafts: ReadonlyMap<Segment, Draft>, failures: Failures) => {
  const allFailures = new Map([...failures, ...applyDrafts(drafts)]);
  setLanguage(run.book, run.documents, run.pair.to);
  await writeBook(run.book, serializeDocuments(run.documents), run.settings.output);
  const flagged = run.segments
    .map((segment) => flagSegment(run, segment, drafts.get(segment), allFailures.get(segment)))
    .filter((entry) => entry.flags.length > 0);
  await writeReport(run.settings.reportPath, flagged);
  return { flagged, failed: allFailures.size };
};

export const translateBook = async (settings: TranslateSettings): Promise<TranslateSummary> => {
  const startedAt = Date.now();
  const run = await startRun(settings);
  const translator = engineFor(run, settings.translator);
  const translated = await runPhase(run, TRANSLATE_PHASE, run.segments, (segment) => draftSegment(segment, translator));
  const { drafts, reviewFailures } = settings.reviewer
    ? await reviewDrafts(run, settings.reviewer, translated.results)
    : { drafts: translated.results, reviewFailures: 0 };
  const { flagged, failed } = await writeOutputs(run, drafts, translated.failures);
  return {
    pair: run.pair,
    segments: run.segments.length,
    flagged: flagged.length,
    failed,
    reviewFailures,
    skippedFiles: run.skippedFiles,
    seconds: (Date.now() - startedAt) / MS_PER_SECOND,
  };
};
