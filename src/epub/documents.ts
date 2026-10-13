import type { Document } from '@xmldom/xmldom';
import { readEntry, setBookLanguage, setDocumentLanguage, type Book, type ContentFile } from './book.ts';
import { errorMessage } from '../shared/guards.ts';
import { findNcxSegments, findXhtmlSegments, type Segment } from './segments.ts';
import { XHTML_MIME, parseXml, serialize } from './xml.ts';

export type ContentDocument = ContentFile & { readonly doc: Document };
export type SkippedFile = { readonly path: string; readonly reason: string };
type LoadedDocuments = { readonly documents: ContentDocument[]; readonly skipped: SkippedFile[] };

const loadDocument = async (book: Book, file: ContentFile): Promise<ContentDocument | SkippedFile> => {
  try {
    const source = await readEntry(book.zip, file.path);
    return { ...file, doc: parseXml(source, file.kind === 'ncx' ? 'application/xml' : XHTML_MIME) };
  } catch (error) {
    return { path: file.path, reason: errorMessage(error) };
  }
};

export const loadDocuments = async (book: Book): Promise<LoadedDocuments> => {
  const loaded = await Promise.all(book.contents.map((file) => loadDocument(book, file)));
  return {
    documents: loaded.filter((entry): entry is ContentDocument => 'doc' in entry),
    skipped: loaded.filter((entry): entry is SkippedFile => 'reason' in entry),
  };
};

export const collectSegments = (documents: readonly ContentDocument[]): Segment[] =>
  documents.flatMap(({ path, kind, doc }) =>
    kind === 'ncx' ? findNcxSegments(path, doc) : findXhtmlSegments(path, doc),
  );

export const setLanguage = (book: Book, documents: readonly ContentDocument[], code: string): void => {
  setBookLanguage(book, code);
  documents.forEach(({ doc }) => {
    setDocumentLanguage(doc, code);
  });
};

export const serializeDocuments = (documents: readonly ContentDocument[]): Map<string, string> =>
  new Map(documents.map(({ path, doc }) => [path, serialize(doc)]));
