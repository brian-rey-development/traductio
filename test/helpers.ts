import { writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import JSZip from 'jszip';
import type { Document } from '@xmldom/xmldom';
import { isRecord } from '../src/shared/guards.ts';
import { parseXml } from '../src/epub/xml.ts';

export const xhtmlPage = (body: string, rootAttributes = ''): string =>
  `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"${rootAttributes} xml:lang="en" lang="en"><head><title>t</title></head><body>${body}</body></html>`;

export const parsePage = (body: string, rootAttributes = ''): Document => parseXml(xhtmlPage(body, rootAttributes));

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>T</dc:title><dc:language>en</dc:language></metadata>
<manifest><item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest>
<spine toc="ncx"><itemref idref="c1"/></spine></package>`;
const NCX = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap><navPoint id="n1"><navLabel><text>Chapter One</text></navLabel><content src="text/one.xhtml"/></navPoint></navMap></ncx>`;
const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

export const writeFixtureEpub = async (path: string, chapter: string): Promise<void> => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', CONTAINER);
  zip.file('OEBPS/content.opf', OPF);
  zip.file('OEBPS/toc.ncx', NCX);
  zip.file('OEBPS/text/one.xhtml', chapter);
  await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }));
};

const multiOpf = (count: number): string => {
  const items = Array.from(
    { length: count },
    (_, i) => `<item id="c${i + 1}" href="text/chapter-${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
  ).join('');
  const refs = Array.from({ length: count }, (_, i) => `<itemref idref="c${i + 1}"/>`).join('');
  return `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>T</dc:title><dc:language>en</dc:language></metadata>
<manifest>${items}<item id="nav" href="text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest>
<spine toc="ncx">${refs}</spine></package>`;
};

const multiNcx = (count: number): string => {
  const points = Array.from(
    { length: count },
    (_, i) =>
      `<navPoint id="n${i + 1}"><navLabel><text>Chapter ${i + 1}</text></navLabel><content src="text/chapter-${i + 1}.xhtml"/></navPoint>`,
  ).join('');
  return `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>${points}</navMap></ncx>`;
};

const multiNav = (count: number): string => {
  const links = Array.from(
    { length: count },
    (_, i) => `<li><a href="chapter-${i + 1}.xhtml">Chapter ${i + 1}</a></li>`,
  ).join('');
  return xhtmlPage(`<nav><ol>${links}</ol></nav>`);
};

export const writeMultiChapterEpub = async (path: string, chapters: readonly string[]): Promise<void> => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', CONTAINER);
  zip.file('OEBPS/content.opf', multiOpf(chapters.length));
  zip.file('OEBPS/text/nav.xhtml', multiNav(chapters.length));
  zip.file('OEBPS/toc.ncx', multiNcx(chapters.length));
  chapters.forEach((chapter, i) => zip.file(`OEBPS/text/chapter-${i + 1}.xhtml`, chapter));
  await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }));
};

export type FakeServer = { readonly url: string; readonly calls: () => number; readonly close: () => void };
type FakeModel = (prompt: string) => string;

const readPrompt = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  const body = JSON.parse(Buffer.concat(chunks).toString()) as unknown;
  const message = (isRecord(body) && Array.isArray(body.messages) ? body.messages[0] : undefined) as unknown;
  return isRecord(message) && typeof message.content === 'string' ? message.content : '';
};

export const startFakeServer = (models: readonly string[], respond: FakeModel): Promise<FakeServer> => {
  let calls = 0;
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/v1/models') {
      response.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
      return;
    }
    calls += 1;
    const content = respond(await readPrompt(request));
    response.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
  };
  const server: Server = createServer((request, response) => {
    void handle(request, response);
  });
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Fake server did not bind to a TCP port'));
        return;
      }
      resolve({ url: `http://127.0.0.1:${address.port}/v1`, calls: () => calls, close: () => server.close() });
    });
  });
};
