import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { isFileNotFound, isRecord } from '../shared/guards.ts';

type CacheEntry = { readonly key: string; readonly value: string };

export type Cache = {
  readonly get: (key: string) => string | undefined;
  readonly set: (key: string, value: string) => Promise<void>;
};

export const cachePathFor = (bookId: string): string => {
  const cacheRoot = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  return join(cacheRoot, 'traductio', `${bookId}.jsonl`);
};

export const cacheKey = (...parts: readonly string[]): string =>
  createHash('sha256').update(parts.join('\u0000')).digest('hex');

const toEntry = (record: unknown): CacheEntry[] => {
  if (!isRecord(record)) return [];
  const { key, value } = record;
  return typeof key === 'string' && typeof value === 'string' ? [{ key, value }] : [];
};

const parseLine = (line: string): CacheEntry[] => {
  try {
    return toEntry(JSON.parse(line));
  } catch {
    return [];
  }
};

const readCacheFile = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isFileNotFound(error)) return '';
    throw error;
  }
};

const serializeEntries = (entries: ReadonlyMap<string, string>): string =>
  [...entries].map(([key, value]) => `${JSON.stringify({ key, value })}\n`).join('');

const loadInto = (entries: Map<string, string>, raw: string): void => {
  raw
    .split('\n')
    .flatMap(parseLine)
    .forEach(({ key, value }) => {
      entries.set(key, value);
    });
};

const appendDelta = async (partialPath: string, delta: string, entries: Map<string, string>): Promise<void> => {
  await appendFile(partialPath, delta === '' || delta.endsWith('\n') ? delta : `${delta}\n`);
  loadInto(entries, delta);
};

// A second live process may append while compaction writes, so anything appended after the
// snapshot is merged into the compacted file instead of being renamed away.
const compactCacheFile = async (path: string, raw: string, entries: Map<string, string>): Promise<void> => {
  const partialPath = `${path}.${process.pid}.partial`;
  await writeFile(partialPath, serializeEntries(entries));
  const current = await readCacheFile(path);
  if (current !== raw && !current.startsWith(raw)) {
    await rm(partialPath, { force: true });
    entries.clear();
    loadInto(entries, current);
    if (current && !current.endsWith('\n')) await appendFile(path, '\n');
    return;
  }
  if (current !== raw) await appendDelta(partialPath, current.slice(raw.length), entries);
  await rename(partialPath, path);
};

const repairCacheFile = async (path: string, raw: string, entries: Map<string, string>): Promise<void> => {
  const storedLines = raw.split('\n').filter(Boolean).length;
  if (storedLines > entries.size) await compactCacheFile(path, raw, entries);
  // A run killed mid-write can leave a line without its newline, which the next append would fuse with.
  else if (raw && !raw.endsWith('\n')) await appendFile(path, '\n');
};

export const openCache = async (path: string): Promise<Cache> => {
  await mkdir(dirname(path), { recursive: true });
  const raw = await readCacheFile(path);
  const entries = new Map<string, string>();
  loadInto(entries, raw);
  await repairCacheFile(path, raw, entries);
  return {
    get: (key) => entries.get(key),
    set: async (key, value) => {
      if (entries.get(key) === value) return;
      await appendFile(path, `${JSON.stringify({ key, value })}\n`);
      entries.set(key, value);
    },
  };
};
