import type { ContentFile } from './book.ts';

export type SpineChapter = { readonly index: number; readonly path: string };

const CHAPTER_PART = /^(\d+)(?:\s*-\s*(\d+))?$/;
const MAX_RANGE_SIZE = 10_000;

export const spineChapters = (contents: readonly ContentFile[]): SpineChapter[] =>
  contents.filter((file) => file.kind === 'xhtml').map((file, position) => ({ index: position + 1, path: file.path }));

const invalidSelection = (part: string): Error =>
  new Error(`--chapters "${part}" is not a chapter number or range (for example 3 or 3,5-7)`);

const expandPart = (part: string, indexes: Set<number>): void => {
  const match = CHAPTER_PART.exec(part);
  if (!match) throw invalidSelection(part);
  const [, startText = '', endText] = match;
  const start = Number(startText);
  const end = endText === undefined ? start : Number(endText);
  if (start < 1) throw invalidSelection(part);
  if (end < start) throw new Error(`--chapters range ${start}-${end} ends before it starts`);
  if (end - start + 1 > MAX_RANGE_SIZE) throw new Error(`--chapters range ${start}-${end} is implausibly large`);
  for (let index = start; index <= end; index += 1) indexes.add(index);
};

export const parseChapterSelection = (spec: string): number[] => {
  const indexes = new Set<number>();
  spec.split(',').forEach((part) => {
    expandPart(part.trim(), indexes);
  });
  return [...indexes].sort((a, b) => a - b);
};

export const selectChapterPaths = (
  contents: readonly ContentFile[],
  selection: readonly number[],
): ReadonlySet<string> => {
  const chapters = spineChapters(contents);
  if (chapters.length === 0) throw new Error('Cannot select chapters because the book has no chapters in its spine');
  const paths = new Set(contents.filter((file) => file.kind !== 'xhtml').map((file) => file.path));
  selection.forEach((index) => {
    const chapter = chapters[index - 1];
    if (!chapter) {
      const count = `${chapters.length} chapter${chapters.length === 1 ? '' : 's'}`;
      throw new Error(`--chapters chapter ${index} is out of range, the book has ${count}`);
    }
    paths.add(chapter.path);
  });
  return paths;
};
