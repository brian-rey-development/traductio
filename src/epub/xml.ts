import { DOMParser, Node, XMLSerializer, type Document, type Element, type Text } from '@xmldom/xmldom';

type Mime = 'application/xhtml+xml' | 'application/xml';

export const XHTML_MIME = 'application/xhtml+xml';
const FRAGMENT_ROOT = 'traductio-fragment';

const throwOnError = (level: string, message: string): void => {
  if (level !== 'warning') throw new Error(message);
};

export const parseXml = (source: string, mime: Mime = XHTML_MIME): Document =>
  new DOMParser({ onError: throwOnError }).parseFromString(source, mime);

export const serialize = (node: Node): string => new XMLSerializer().serializeToString(node);

export const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE;

export const isText = (node: Node): node is Text =>
  node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE;

export const descendants = (root: Document | Element): Element[] => Array.from(root.getElementsByTagName('*'));

export const escapeText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const escapeAttribute = (value: string): string => escapeText(value).replace(/"/g, '&quot;');

const isNamespaceDeclaration = (name: string): boolean => name === 'xmlns' || name.startsWith('xmlns:');

export const inScopeNamespaces = (element: Element): string => {
  const declarations = new Map<string, string>();
  for (let node: Node | null = element; node && isElement(node); node = node.parentNode) {
    for (const { name, value } of Array.from(node.attributes)) {
      if (isNamespaceDeclaration(name) && !declarations.has(name)) declarations.set(name, value);
    }
  }
  return [...declarations].map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');
};

export const parseFragment = (markup: string, namespaces: string): Node[] => {
  const root = parseXml(`<${FRAGMENT_ROOT}${namespaces}>${markup}</${FRAGMENT_ROOT}>`).documentElement;
  return root ? Array.from(root.childNodes) : [];
};

export const ownerDocumentOf = (node: Node): Document => {
  const doc = node.ownerDocument;
  if (!doc) throw new Error('Node is not attached to a document');
  return doc;
};
