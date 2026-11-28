import {boundaryLocators, openTrees} from './contexts';
import {createDomMatcher} from './validation';

const signal = 'pom-frame-owner-v1';
export const frameNonce = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);

export function frameOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 320) return false;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}

export function announceFrame(nonce: string, parentOrigin: string) {
  if (window.parent === window) return false;
  window.parent.postMessage({type: signal, nonce}, parentOrigin);
  return true;
}

export function correlateFrame(nonce: string, origin: string, testAttribute: string, reply: (result: unknown) => void) {
  const events = new AbortController();
  const finish = (result: unknown) => {
    events.abort();
    clearTimeout(timer);
    reply(result);
  };
  const timer = window.setTimeout(() => finish(null), 1000);
  window.addEventListener('pagehide', () => finish(null), {once: true, signal: events.signal});
  window.addEventListener('message', event => {
    if (!event.isTrusted || event.origin !== origin || event.data?.type !== signal || event.data.nonce !== nonce || !event.source) return;
    const match = createDomMatcher(document);
    const path = [];
    const owner = openTrees(document).flatMap(root => Array.from(root.querySelectorAll('iframe')))
      .find(frame => (frame as HTMLIFrameElement).contentWindow === event.source);
    if (!owner) return;
    let boundary: Element = owner;
    for (let depth = 0; depth < 4; depth++) {
      const tree = boundary.getRootNode();
      const locator = boundaryLocators(boundary, testAttribute).find(candidate => {
        const found = match(candidate, tree as Document | ShadowRoot);
        return found.length === 1 && found[0] === boundary;
      });
      if (!locator) {finish(null); return;}
      path.unshift({kind: boundary === owner ? 'frame' : 'shadow', tag: boundary.localName, owner: locator});
      if (!('host' in tree)) {finish(path); return;}
      boundary = (tree as ShadowRoot).host;
    }
    finish(null);
  }, {signal: events.signal});
}
