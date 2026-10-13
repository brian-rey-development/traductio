import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { posix } from 'node:path';
import JSZip from 'jszip';
import type { Document, Element } from '@xmldom/xmldom';
import { XHTML_MIME, descendants, parseXml, serialize } from './xml.ts';

export type ContentKind = 'xhtml' | 'ncx';
export type ContentFile = { readonly path: string; readonly kind: ContentKind };

export type Book = {
  readonly id: string;
  readonly zip: JSZip;
  readonly opfPath: string;
  readonly opf: Document;
  readonly contents: readonly ContentFile[];
};

const CONTAINER_PATH = 'META-INF/container.xml';
const MIMETYPE_PATH = 'mimetype';
const NCX_MIME = 'application/x-dtbncx+xml';
const BOOK_ID_LENGTH = 16;

const byLocalName = (doc: Document, name: string): Element[] =>
  descendants(doc).filter((element) => element.localName === name);

export const readEntry = async (zip: JSZip, path: string): Promise<string> => {
  const entry = zip.file(path) ?? zip.file(path.normalize('NFC')) ?? zip.file(path.normalize('NFD'));
  if (!entry) throw new Error(`${path} is listed in the package but missing from the archive`);
  return entry.async('string');
};

const findOpfPath = async (zip: JSZip): Promise<string> => {
  const container = parseXml(await readEntry(zip, CONTAINER_PATH), 'application/xml');
  const rootfile = byLocalName(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!rootfile) throw new Error('container.xml does not point to a package document');
  return rootfile;
};

const decodeHref = (href: string): string => {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
};

const resolveHref = (opfPath: string, item: Element): string =>
  posix.normalize(posix.join(posix.dirname(opfPath), decodeHref(item.getAttribute('href') ?? '')));

const isNavDocument = (item: Element): boolean =>
  (item.getAttribute('properties') ?? '').split(/\s+/).includes('nav');

const listContents = (opf: Document, opfPath: string): ContentFile[] => {
  const items = byLocalName(opf, 'item');
  const byId = new Map(items.map((item) => [item.getAttribute('id'), item] as const));
  const spine = byLocalName(opf, 'itemref').flatMap((ref) => byId.get(ref.getAttribute('idref')) ?? []);
  const nav = items.filter((item) => isNavDocument(item) && !spine.includes(item));
  const xhtml = [...spine, ...nav].filter((item) => item.getAttribute('media-type') === XHTML_MIME);
  const ncx = items.filter((item) => item.getAttribute('media-type') === NCX_MIME);
  return [
    ...xhtml.map((item) => ({ path: resolveHref(opfPath, item), kind: 'xhtml' as const })),
    ...ncx.map((item) => ({ path: resolveHref(opfPath, item), kind: 'ncx' as const })),
  ];
};

export const loadBook = async (file: string): Promise<Book> => {
  const bytes = await readFile(file);
  const zip = await JSZip.loadAsync(bytes);
  const opfPath = await findOpfPath(zip);
  const opf = parseXml(await readEntry(zip, opfPath), 'application/xml');
  const id = createHash('sha256').update(bytes).digest('hex').slice(0, BOOK_ID_LENGTH);
  return { id, zip, opfPath, opf, contents: listContents(opf, opfPath) };
};

export const bookLanguage = (book: Book): string | undefined =>
  byLocalName(book.opf, 'language')[0]?.textContent?.trim().split('-')[0] || undefined;

export const setBookLanguage = (book: Book, code: string): void =>
  byLocalName(book.opf, 'language').forEach((element) => {
    element.textContent = code;
  });

export const setDocumentLanguage = (doc: Document, code: string): void => {
  const root = doc.documentElement;
  if (root?.hasAttribute('lang')) root.setAttribute('lang', code);
  if (root?.hasAttribute('xml:lang')) root.setAttribute('xml:lang', code);
};

const copyEntry = async (source: JSZip, target: JSZip, path: string): Promise<void> => {
  const entry = source.file(path);
  if (entry && !entry.dir) target.file(path, await entry.async('uint8array'));
};

export const writeBook = async (book: Book, replacements: ReadonlyMap<string, string>, outPath: string): Promise<void> => {
  const out = new JSZip();
  out.file(MIMETYPE_PATH, 'application/epub+zip', { compression: 'STORE' });
  const paths = Object.keys(book.zip.files).filter((path) => path !== MIMETYPE_PATH);
  for (const path of paths) {
    const replacement = path === book.opfPath ? serialize(book.opf) : replacements.get(path);
    if (replacement === undefined) await copyEntry(book.zip, out, path);
    else out.file(path, replacement);
  }
  const partialPath = `${outPath}.partial`;
  await writeFile(partialPath, await out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  await rename(partialPath, outPath);
};
