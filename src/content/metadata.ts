import type {Action} from '../core/model';
import {accessibleName, accessibleRole, associatedLabels, normalize, pageText} from './accessibility';

export function extractMetadata(element: HTMLElement, text: WeakMap<Element, string>) {
  const tag = element.localName;
  const type = tag === 'input' ? (element as HTMLInputElement).type : '';
  const role = accessibleRole(element);
  const name = accessibleName(element);
  const labels = associatedLabels(element, text);
  const exactText = normalize(pageText(element, text));
  const label = name || labels.join(' ') || element.getAttribute('placeholder') ||
    exactText || element.getAttribute('name') || element.id || tag;
  let action: Action = 'click';
  if (tag === 'select') action = 'select';
  else if (type === 'checkbox' || type === 'radio') action = 'check';
  else if (tag === 'textarea' || element.isContentEditable ||
    (type && !['button', 'submit', 'reset', 'file', 'image', 'range', 'color'].includes(type))) action = 'fill';
  return {tag, role, name, labels, exactText, label: normalize(label).slice(0, 120), action,
    defaultSelected: !['file', 'range', 'color'].includes(type)};
}
