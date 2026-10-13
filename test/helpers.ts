import { writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import JSZip from 'jszip';
import type { Document } from '@xmldom/xmldom';
import { isRecord } from '../src/guards.ts';
import { parseXml } from '../src/xml.ts';

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

export type FakeServer = { readonly url: string; readonly calls: () => number; readonly close: () => void };
export type FakeModel = (prompt: string) => string;

const readPrompt = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
  const message = isRecord(body) && Array.isArray(body.messages) ? body.messages[0] : undefined;
  return isRecord(message) && typeof message.content === 'string' ? message.content : '';
};

export const startFakeServer = (models: readonly string[], respond: FakeModel): Promise<FakeServer> => {
  let calls = 0;
  const server: Server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/v1/models') return response.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
    calls += 1;
    const content = respond(await readPrompt(request));
    response.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/v1`, calls: () => calls, close: () => server.close() });
    });
  });
};
