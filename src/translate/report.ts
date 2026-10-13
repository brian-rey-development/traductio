import { writeFile } from 'node:fs/promises';
import type { Flag } from './checks.ts';
import type { Segment } from '../epub/segments.ts';

export type FlaggedSegment = {
  readonly segment: Segment;
  readonly flags: readonly Flag[];
  readonly translation: string;
  readonly error?: string | undefined;
};

const FLAG_DESCRIPTIONS: Readonly<Record<Flag, string>> = {
  failed: 'no translation could be produced, so the original text was kept',
  empty: 'the model returned nothing',
  'too-short': 'the translation is much shorter than the source, so content may be missing',
  'too-long': 'the translation is much longer than the source, so the model may have added text',
  untranslated: 'the output is identical to the source',
  'markup-lost': 'some inline formatting such as italics or links was dropped',
};

const FLAG_SEVERITY: readonly Flag[] = ['failed', 'empty', 'too-short', 'too-long', 'untranslated', 'markup-lost'];

const severityOf = (entry: FlaggedSegment): number =>
  entry.flags.length === 0 ? FLAG_SEVERITY.length : Math.min(...entry.flags.map((flag) => FLAG_SEVERITY.indexOf(flag)));

const quote = (text: string): string =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

const renderEntry = ({ segment, flags, translation, error }: FlaggedSegment, index: number): string =>
  [
    `## ${index + 1}. ${segment.path}`,
    flags.map((flag) => `- **${flag}**: ${FLAG_DESCRIPTIONS[flag]}`).join('\n'),
    ...(error ? [`Error: ${error}`] : []),
    quote(segment.plain),
    quote(translation || '(no translation)'),
  ].join('\n\n');

export const writeReport = async (path: string, flagged: readonly FlaggedSegment[]): Promise<void> => {
  const ordered = [...flagged].sort((a, b) => severityOf(a) - severityOf(b));
  const header = [
    '# Rosetta review report',
    `${flagged.length} segments need a human look, most serious first. Each entry shows the source and then the translation.`,
  ].join('\n\n');
  await writeFile(path, `${[header, ...ordered.map(renderEntry)].join('\n\n')}\n`);
};
