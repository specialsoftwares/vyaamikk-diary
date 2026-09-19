/**
 * Minimal document for react-dom createRoot in Node tests.
 * Not a browser, jsdom, or device environment.
 */
class Node {
  parentNode: Node | null = null;
  contains(other: Node | null): boolean {
    let n: Node | null = other;
    while (n) {
      if (n === this) return true;
      n = n.parentNode;
    }
    return false;
  }
}
class Element extends Node {}
class HTMLElement extends Element {}
class HTMLIFrameElement extends HTMLElement {}
class Text extends Node {}
class Document extends Node {}
class HTMLDocument extends Document {}

type FakeEl = HTMLElement & {
  nodeType: number;
  nodeName: string;
  tagName: string;
  ownerDocument: FakeDoc;
  childNodes: FakeNode[];
  style: Record<string, string>;
  firstChild: FakeNode | null;
  lastChild: FakeNode | null;
  namespaceURI: string;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  removeAttribute: (name: string) => void;
  hasAttribute: (name: string) => boolean;
  addEventListener: () => void;
  removeEventListener: () => void;
  appendChild: (child: FakeNode) => FakeNode;
  removeChild: (child: FakeNode) => FakeNode;
  insertBefore: (child: FakeNode, ref?: FakeNode | null) => FakeNode;
  attrs: Record<string, string>;
};

type FakeText = Text & {
  nodeType: number;
  data: string;
  nodeValue: string;
  ownerDocument: FakeDoc;
};

type FakeNode = FakeEl | FakeText;

type FakeDoc = HTMLDocument & {
  nodeType: number;
  body: FakeEl;
  documentElement: FakeEl;
  activeElement: FakeEl;
  defaultView: typeof globalThis;
  createElement: (tag: string) => FakeEl;
  createElementNS: (ns: string, tag: string) => FakeEl;
  createTextNode: (text: string) => FakeText;
  addEventListener: () => void;
  removeEventListener: () => void;
};

function syncChildren(node: FakeEl): void {
  node.firstChild = node.childNodes[0] ?? null;
  node.lastChild = node.childNodes[node.childNodes.length - 1] ?? null;
}

function el(tag: string, doc: FakeDoc): FakeEl {
  const node = (tag === "iframe" ? new HTMLIFrameElement() : new HTMLElement()) as FakeEl;
  node.nodeType = 1;
  node.nodeName = tag.toUpperCase();
  node.tagName = tag.toUpperCase();
  node.ownerDocument = doc;
  node.parentNode = null;
  node.childNodes = [];
  node.style = {};
  node.firstChild = null;
  node.lastChild = null;
  node.namespaceURI = "http://www.w3.org/1999/xhtml";
  node.attrs = {};
  node.setAttribute = function setAttribute(name: string, value: string) {
    node.attrs[name] = String(value);
  };
  node.getAttribute = function getAttribute(name: string) {
    return node.attrs[name] ?? null;
  };
  node.removeAttribute = function removeAttribute(name: string) {
    delete node.attrs[name];
  };
  node.hasAttribute = function hasAttribute(name: string) {
    return Object.prototype.hasOwnProperty.call(node.attrs, name);
  };
  node.addEventListener = function addEventListener() {};
  node.removeEventListener = function removeEventListener() {};
  node.appendChild = function appendChild(child: FakeNode) {
    node.childNodes.push(child);
    child.parentNode = node;
    syncChildren(node);
    return child;
  };
  node.removeChild = function removeChild(child: FakeNode) {
    node.childNodes = node.childNodes.filter((c) => c !== child);
    child.parentNode = null;
    syncChildren(node);
    return child;
  };
  node.insertBefore = function insertBefore(child: FakeNode, ref?: FakeNode | null) {
    if (!ref) return node.appendChild(child);
    const i = node.childNodes.indexOf(ref);
    node.childNodes.splice(i < 0 ? node.childNodes.length : i, 0, child);
    child.parentNode = node;
    syncChildren(node);
    return child;
  };
  return node;
}

const doc = new HTMLDocument() as FakeDoc;
doc.nodeType = 9;
doc.addEventListener = function addEventListener() {};
doc.removeEventListener = function removeEventListener() {};
doc.createElement = function createElement(tag: string) {
  return el(tag, doc);
};
doc.createElementNS = function createElementNS(_ns: string, tag: string) {
  return el(tag, doc);
};
doc.createTextNode = function createTextNode(text: string) {
  const node = new Text() as FakeText;
  node.nodeType = 3;
  node.data = String(text);
  node.nodeValue = String(text);
  node.ownerDocument = doc;
  node.parentNode = null;
  return node;
};
doc.body = el("body", doc);
doc.documentElement = el("html", doc);
doc.activeElement = doc.body;
doc.defaultView = globalThis;

Object.assign(globalThis, {
  document: doc,
  window: globalThis,
  navigator: { userAgent: "node-quota-upsell-host" },
  HTMLElement,
  HTMLIFrameElement,
  Element,
  Node,
  Text,
  Document,
  HTMLDocument,
  IS_REACT_ACT_ENVIRONMENT: true,
});

export function createMountContainer(): FakeEl {
  const container = el("div", doc);
  doc.body.appendChild(container);
  return container;
}
