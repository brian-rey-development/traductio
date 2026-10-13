import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { isFileNotFound, isRecord } from './guards.ts';

type CacheEntry = { readonly key: string; readonly value: string };

export type Cache = {
  readonly get: (key: string) => string | undefined;
  readonly set: (key: string, value: string) => Promise<void>;
};

export const cachePathFor = (bookId: string): string => {
  const cacheRoot = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  return join(cacheRoot, 'rosetta', `${bookId}.jsonl`);
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

export const openCache = async (path: string): Promise<Cache> => {
  await mkdir(dirname(path), { recursive: true });
  const raw = await readCacheFile(path);
  const entries = new Map(raw.split('\n').flatMap(parseLine).map(({ key, value }) => [key, value]));
  // A run killed mid-write can leave a line without its newline, which the next append would fuse with.
  if (raw && !raw.endsWith('\n')) await appendFile(path, '\n');
  return {
    get: (key) => entries.get(key),
    set: async (key, value) => {
      entries.set(key, value);
      await appendFile(path, `${JSON.stringify({ key, value })}\n`);
    },
  };
};
