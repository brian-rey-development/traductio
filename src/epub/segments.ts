import type { Document, Element, Node } from '@xmldom/xmldom';
import { normalizeSpace, toPlainText, type Tag, type TagMap } from './markup.ts';
import { descendants, escapeAttribute, inScopeNamespaces, isElement, isText, ownerDocumentOf } from './xml.ts';

export type Segment = {
  readonly path: string;
  readonly parent: Element;
  readonly nodes: readonly Node[];
  readonly encoded: string;
  readonly plain: string;
  readonly tags: TagMap;
  readonly namespaces: string;
};

type Run = { readonly kind: 'block'; readonly element: Element } | { readonly kind: 'inline'; readonly nodes: Node[] };

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'caption',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);
const UNTRANSLATABLE_TAGS = new Set(['head', 'math', 'pre', 'script', 'style', 'svg']);
const HAS_LETTER = /\p{L}/u;

const tagNameOf = (node: Node): string => (isElement(node) ? (node.localName ?? '') : '');
const isBlock = (node: Node): node is Element => BLOCK_TAGS.has(tagNameOf(node));
const isUntranslatable = (node: Node): boolean => UNTRANSLATABLE_TAGS.has(tagNameOf(node));

const attributesOf = (element: Element): string =>
  Array.from(element.attributes)
    .map(({ name, value }) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');

const encodeNodes = (nodes: readonly Node[], tags: Map<string, Tag>): string => {
  let encoded = '';
  for (const node of nodes) encoded += encodeNode(node, tags);
  return encoded;
};

const encodeNode = (node: Node, tags: Map<string, Tag>): string => {
  if (isText(node)) return node.data;
  if (!isElement(node)) return '';
  const id = String(tags.size + 1);
  const name = node.localName ?? node.tagName;
  const opening = `<${node.tagName}${attributesOf(node)}`;
  if (node.childNodes.length === 0) {
    tags.set(id, { name, open: `${opening}/>`, close: '' });
    return `<${id}/>`;
  }
  tags.set(id, { name, open: `${opening}>`, close: `</${node.tagName}>` });
  return `<${id}>${encodeNodes(Array.from(node.childNodes), tags)}</${id}>`;
};

const toSegment = (path: string, parent: Element, nodes: readonly Node[]): Segment[] => {
  const tags = new Map<string, Tag>();
  const encoded = normalizeSpace(encodeNodes(nodes, tags));
  const plain = toPlainText(encoded);
  if (!HAS_LETTER.test(plain)) return [];
  return [{ path, parent, nodes, encoded, plain, tags, namespaces: inScopeNamespaces(parent) }];
};

const splitIntoRuns = (nodes: readonly Node[]): Run[] => {
  const runs: Run[] = [];
  let inline: Node[] = [];
  for (const node of nodes) {
    if (!isBlock(node) && !isUntranslatable(node)) {
      inline.push(node);
      continue;
    }
    if (inline.length > 0) runs.push({ kind: 'inline', nodes: inline });
    inline = [];
    if (isBlock(node)) runs.push({ kind: 'block', element: node });
  }
  if (inline.length > 0) runs.push({ kind: 'inline', nodes: inline });
  return runs;
};

const segmentsWithin = (path: string, element: Element): Segment[] => {
  const children = Array.from(element.childNodes);
  const hasStructure = children.some((child) => isBlock(child) || isUntranslatable(child));
  if (!hasStructure) return toSegment(path, element, children);
  return splitIntoRuns(children).flatMap((run) =>
    run.kind === 'block' ? segmentsWithin(path, run.element) : toSegment(path, element, run.nodes),
  );
};

export const findXhtmlSegments = (path: string, doc: Document): Segment[] => {
  const body = descendants(doc).find((element) => element.localName === 'body');
  return body ? segmentsWithin(path, body) : [];
};

export const findNcxSegments = (path: string, doc: Document): Segment[] =>
  descendants(doc)
    .filter((element) => element.localName === 'text')
    .flatMap((element) => toSegment(path, element, Array.from(element.childNodes)));

export const replaceSegmentContent = (segment: Segment, replacements: readonly Node[]): void => {
  const { parent, nodes } = segment;
  const doc = ownerDocumentOf(parent);
  const anchor = nodes[0] ?? null;
  replacements.forEach((node) => parent.insertBefore(doc.importNode(node, true), anchor));
  nodes.forEach((node) => parent.removeChild(node));
};
