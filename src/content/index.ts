import {identifier} from '../core/python-names';
import {defaultSettings, type LocatorSettings} from '../core/locator';
import type {PageModel} from '../core/model';
import {generateCandidates} from './candidates';
import {extractMetadata} from './metadata';
import {createDomValidator} from './validation';

const discovery = 'button,a[href],input:not([type=hidden]),select,textarea,[role~=button],[role~=checkbox],[role~=combobox],[role~=link],[role~=textbox],[role~=searchbox],[role~=radio],[role~=listbox],[role~=slider],[role~=spinbutton],[role~=switch],[role~=tab],[role~=menuitem],[contenteditable=true]';
const nodes = new Map<string, Element>();
let overlay: HTMLElement | undefined;

function scan(settings: LocatorSettings): PageModel {
  nodes.clear();
  const elements: PageModel['elements'] = [];
  const text = new WeakMap<Element, string>();
  const validate = createDomValidator(document, text);
  for (const element of document.querySelectorAll(discovery)) {
    if (!(element instanceof HTMLElement) || !element.getClientRects().length ||
      ['hidden', 'collapse'].includes(getComputedStyle(element).visibility)) continue;
    const metadata = extractMetadata(element, text);
    const {label, action, tag, defaultSelected} = metadata;
    const candidates = generateCandidates(element, metadata, settings, validate);
    const id = String(elements.length);
    nodes.set(id, element);
    elements.push({
      id, name: identifier(label + '_' + (action === 'fill' ? 'input' : tag)),
      label, tag, action, candidates, selected: defaultSelected, choice: null,
    });
  }
  return {url: location.origin + location.pathname, className: 'GeneratedPage', elements};
}

function highlight(id: string) {
  overlay?.remove();
  const element = nodes.get(id);
  if (!element?.isConnected) return {ok: false};
  element.scrollIntoView({block: 'center'});
  const rect = element.getBoundingClientRect();
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px',
    height: rect.height + 'px', border: '3px solid #2563eb', pointerEvents: 'none',
    zIndex: '2147483647', boxSizing: 'border-box',
  });
  document.documentElement.append(box);
  overlay = box;
  setTimeout(() => box.remove(), 1800);
  return {ok: true};
}

const state = globalThis as typeof globalThis & {__pomInstalled?: boolean};
if (!state.__pomInstalled) {
  state.__pomInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === 'POM_SCAN') reply(scan(message.settings ?? defaultSettings));
    else if (message.type === 'POM_HIGHLIGHT') reply(highlight(message.id));
  });
}
