import {scopeLocator, type BrowsingContext, type ContextBoundary} from '../core/context';
import {locatorKey, type LocatorSettings} from '../core/locator';
import type {ElementModel, PageModel} from '../core/model';

export interface FrameScan {
  frameId: number;
  documentId: string;
  collectionKey: string;
  context: BrowsingContext;
  rows: ElementModel[];
}

export function scopeEmbeddedRow(row: ElementModel, context: BrowsingContext): ElementModel {
  const combined = {...context, path: [...context.path, ...(row.context?.path ?? [])]};
  const candidates = row.candidates.flatMap(candidate => {
    const locator = scopeLocator(context.path, candidate.locator);
    return locator ? [{...candidate, locator, id: locatorKey(locator)}] : [];
  });
  return {...row, id: 'embedded-' + row.referenceId, context: combined, candidates, choice: null, selected: false};
}

function httpOrigin(url: string) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

export async function scanAuthorizedFrames(tabId: number, origin: string, settings: LocatorSettings): Promise<FrameScan[]> {
  const frames = await chrome.webNavigation.getAllFrames({tabId});
  const top = frames?.find(frame => frame.frameId === 0);
  const parentOrigin = top && httpOrigin(top.url);
  if (!top?.documentId || !parentOrigin) return [];
  const result: FrameScan[] = [];
  for (const frame of (frames ?? []).filter(frame => frame.parentFrameId === 0 && httpOrigin(frame.url) === origin).slice(0, 12)) {
    if (!frame.documentId || frame.parentDocumentId !== top.documentId ||
      frame.errorOccurred || frame.documentLifecycle !== 'active') continue;
    const current = {documentId: frame.documentId};
    try {
      await chrome.scripting.executeScript({target: {tabId, documentIds: [frame.documentId]}, files: ['content.js']});
      const nonce = crypto.randomUUID();
      const owner = chrome.tabs.sendMessage(tabId, {type: 'POM_FRAME_WAIT', origin, nonce, settings},
        {documentId: top.documentId}).catch(() => null) as Promise<ContextBoundary[] | null>;
      await chrome.tabs.sendMessage(tabId, {type: 'POM_FRAME_ANNOUNCE', origin: parentOrigin, nonce}, current);
      const path = await owner;
      if (!path?.length || path.at(-1)?.kind !== 'frame') continue;
      const scan: PageModel = await chrome.tabs.sendMessage(tabId, {type: 'POM_SCAN', settings, embedded: true}, current);
      if (!scan.documentKey) continue;
      const context = {path, state: 'accessible' as const, origin, external: true};
      const rows = scan.elements.map(row => scopeEmbeddedRow(row, context));
      result.push({frameId: frame.frameId, documentId: frame.documentId, collectionKey: scan.documentKey, context, rows});
    } catch {
      // A denied, replaced or sandboxed document remains unavailable.
    }
  }
  return result;
}
