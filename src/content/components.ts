import {componentRootCandidate, signatureSimilarity, type ComponentDefinition, type ComponentMember} from '../core/components';
import {locatorIsValid, locatorKey, type Candidate, type Locator, type LocatorSettings, type Validation} from '../core/locator';
import {identifier} from '../core/python-names';
import {instability} from '../core/scoring';
import {accessibleRole, normalize, pageText} from './accessibility';
import {ElementCollection, inspectable, interactive, visible} from './elements';
import {attributeSelector, classifyMatches, createDomMatcher} from './validation';
import {accessibleDocuments, frameDocument, openTrees, parentInContext, type Tree} from './contexts';

const boundaries = 'article,section,li,tr,form,dialog,fieldset,[role=dialog],[role=group],[role=listitem],[data-slot],[data-component],div[class]';
const assertions = 'h1,h2,h3,h4,h5,h6,p,img,td,th,[role=heading],[role=status],[role=alert],[data-component-member]';
const featuresLimit = 60;
const boundaryLimit = 800;
const groupLimit = 12;
const instanceLimit = 30;

function kind(element: Element): string {
  return `${element.localName}:${element.getAttribute('role') ?? ''}:${element.matches('input') ? (element as HTMLInputElement).type : ''}`;
}

function path(element: Element, root: Element): string {
  const steps = [];
  for (let node: Element | null = element; node && node !== root; node = parentInContext(node)) {
    const key = kind(node);
    const siblings = Array.from(node.parentNode && 'children' in node.parentNode ? node.parentNode.children as HTMLCollection : [])
      .filter(sibling => kind(sibling) === key);
    steps.unshift(`${key}:${siblings.indexOf(node)}`);
  }
  return steps.join('/');
}

function slots(root: Element) {
  const result = new Map<string, Element>();
  const trees: Tree[] = openTrees(root);
  for (let index = 0; index < trees.length && result.size < featuresLimit; index++) {
    const tree = trees[index];
    for (const element of tree.querySelectorAll(`${interactive},${assertions}`)) {
      if (inspectable(element) && visible(element)) result.set(path(element, root), element);
      if (result.size >= featuresLimit) break;
    }
    for (const frame of tree.querySelectorAll('iframe')) {
      if (trees.length >= 24) break;
      const child = frameDocument(frame);
      if (child) trees.push(...openTrees(child, 24 - trees.length));
    }
  }
  return result;
}

function fingerprint(root: Element, entries: Map<string, Element>): string[] {
  const traits = ['data-slot', 'data-component'].flatMap(attribute => {
    const value = root.getAttribute(attribute);
    return value && !instability(value) && value.length <= 100 ? [attribute + '=' + value] : [];
  });
  return [kind(root), ...traits, ...entries.keys()].sort();
}

function rootSelectors(roots: readonly Element[]): string[] {
  const first = roots[0];
  const tag = CSS.escape(first.localName);
  return [
    ...['data-slot', 'data-component', 'role'].flatMap(attribute => {
      const value = first.getAttribute(attribute);
      return value && !instability(value) && roots.every(root => root.getAttribute(attribute) === value)
        ? [tag + attributeSelector(attribute, value)] : [];
    }),
    ...Array.from(first.classList).filter(name => !instability(name) && roots.every(root => root.classList.contains(name)))
      .slice(0, 6).map(name => tag + '.' + CSS.escape(name)),
    tag,
  ];
}

export function describeComponent(roots: Element[], collection: ElementCollection,
  settings: LocatorSettings, confidence: number, slotCache?: WeakMap<Element, Map<string, Element>>,
  observedRoots = roots): ComponentDefinition {
  const pageBuilder = collection.builder(settings);
  const text = new WeakMap<Element, string>();
  const match = createDomMatcher(document, text);
  const membersByRoot = roots.map(root => slotCache?.get(root) ?? slots(root));
  const scopedBuilders = roots.map(root => collection.builder(settings, root));
  const used = new Set<string>();
  const instances = roots.map((root, index) => {
    const row = root.getRootNode() === document ? pageBuilder(root, true).row : collection.builderFor(root, settings)(root, true).row;
    const heading = [...membersByRoot[index].values()].find(element => accessibleRole(element) === 'heading');
    const key = heading ? normalize(pageText(heading, text)).slice(0, 120) : '';
    const base = identifier(key || row.label || root.localName) + '_component';
    let name = base;
    for (let number = 2; used.has(name); number++) name = base + '_' + number;
    used.add(name);
    return {id: 'instance-' + row.id, root: row, name, key: key || undefined};
  });
  const slotKeys = [...new Set(membersByRoot.flatMap(group => [...group.keys()]))].slice(0, featuresLimit);
  const members: ComponentMember[] = slotKeys.flatMap((key, index) => {
    const rowIndex = membersByRoot.findIndex(group => group.has(key));
    const representative = membersByRoot[rowIndex].get(key)!;
    const scope = roots[rowIndex];
    const build = representative.getRootNode() === scope.getRootNode() ? scopedBuilders[rowIndex] :
      collection.builderFor(representative, settings, scope);
    const row = build(representative, true).row;
    const candidates = new Map<string, Candidate>();
    for (const candidate of row.candidates) if (locatorIsValid(candidate.locator)) candidates.set(candidate.id, candidate);
    // Headings and repeated optional slots often vary in text. A tag CSS
    // selector is useful only when it identifies this same slot in each root.
    const tag: Locator = {strategy: 'css', selector: CSS.escape(representative.localName)};
    const tagId = locatorKey(tag);
    if (!candidates.has(tagId)) candidates.set(tagId, {
      id: tagId, locator: tag, score: 55, basis: 'Relative tag', explanations: ['Validated against representative roots.'],
      warnings: [], validation: classifyMatches(match(tag, roots[rowIndex]), representative, 'dom-css'),
    });
    const observations = instances.map((instance, position) => {
      const target = membersByRoot[position].get(key);
      return {
        instanceId: instance.id,
        referenceId: target ? collection.id(target) : undefined,
        checks: Object.fromEntries([...candidates.values()].map((candidate): [string, Validation] => {
          try {
            const found = match(candidate.locator, roots[position]);
            const method = candidate.validation.method;
            const evidence: Validation = target ? classifyMatches(found, target, method) :
              {count: found.length, method, status: found.length ? 'wrong-target' : 'no-match'};
            return [candidate.id, evidence];
          } catch {
            return [candidate.id, {status: 'error', method: 'none'}];
          }
        })),
      } satisfies ComponentMember['observations'][number];
    });
    const optional = observations.some(observation => !observation.referenceId);
    const ranked = [...candidates.values()].sort((left, right) => {
      const coverage = (candidate: Candidate) => observations.filter(observation =>
        observation.checks[candidate.id].status === 'unique-target' ||
        (optional && observation.checks[candidate.id].status === 'no-match')).length;
      return coverage(right) - coverage(left) || right.score - left.score || left.id.localeCompare(right.id);
    });
    if (!ranked.length) return [];
    const preferred = ranked[0];
    const selected = observations.every(observation => observation.checks[preferred.id].status === 'unique-target' ||
      (optional && observation.checks[preferred.id].status === 'no-match'));
    const role = accessibleRole(representative);
    const alias = representative.getAttribute('data-component-member');
    const name = alias ? identifier(alias.slice(0, 100)) : role === 'heading' ? 'heading' : role === 'status' ? 'status' : row.action === 'assert' ?
      (representative.localName === 'p' ? 'description' : representative.localName) : row.name;
    return [{...row, id: 'member-' + key, name: name || 'member_' + index, candidates: ranked,
      selected, optional, observations}];
  });
  let group: ComponentDefinition['collection'];
  if (observedRoots.length > 1) {
    const parent = observedRoots[0].parentElement;
    const parentLocator = parent && observedRoots.every(root => root.parentElement === parent)
      ? componentRootCandidate(collection.builderFor(parent, settings)(parent, true).row)?.locator : undefined;
    const selectors = rootSelectors(observedRoots).map((selector): Locator => ({strategy: 'css', selector}));
    const alternatives = [...selectors, ...selectors.flatMap(child => parentLocator ?
      [{strategy: 'chain', root: parentLocator, child} as Locator] : [])];
    const locator = alternatives.find(candidate => {
      const results = match(candidate);
      const found = new Set(results);
      return found.size === observedRoots.length && observedRoots.every(root => found.has(root));
    });
    if (locator) {
      const keys = instances.flatMap(instance => instance.key ? [instance.key] : []);
      const unique = keys.length === roots.length && new Set(keys).size === roots.length &&
        instances.every((instance, index) => {
          const results = match({strategy: 'filter', base: locator, has: {strategy: 'role', role: 'heading', name: instance.key!}});
          return results.length === 1 && results[0] === roots[index];
        });
      group = {locator, count: observedRoots.length, parameter: unique ? {name: 'name', role: 'heading'} : undefined};
      if (unique) instances.forEach((instance, index) => {
        const candidate: Locator = {strategy: 'filter', base: locator,
          has: {strategy: 'role', role: 'heading', name: instance.key!}};
        instance.root.candidates.push({id: locatorKey(candidate), locator: candidate, score: 95, basis: 'Collection key',
          explanations: ['A distinct exact heading identifies the sampled instance.'], warnings: [],
          validation: classifyMatches(match(candidate), roots[index], 'semantic-approximation')});
      });
    }
  }
  const tag = roots[0].localName;
  const title = tag[0].toUpperCase() + tag.slice(1) + ' component';
  return {
    id: 'component-' + instances[0].root.id, title,
    className: title.replace(/\s+/g, '') + instances[0].root.id.replace(/\D/g, ''),
    confidence, signature: fingerprint(roots[0], membersByRoot[0]), members, instances, collection: group, children: [],
    reasons: roots.length === 1 ? ['Explicitly selected root.'] : [
      `${observedRoots.length} sibling containers with the same boundary family. ${roots.length} sampled.`,
      `Lowest structural similarity ${Math.round(confidence * 100)}%.`,
      group ? 'Collection locator matches exactly these roots in the current document.' : 'No exact collection locator was verified.',
    ],
  };
}

export function discoverComponents(collection: ElementCollection, settings: LocatorSettings,
  measure?: (counts: {boundaries: number; candidateRoots: number; comparisons: number; groups: number}) => void,
  scope: Document | Element = document): ComponentDefinition[] {
  const parents = new WeakMap<Element, Map<string, {roots: Element[]; signature: string[]; quality: number}[]>>();
  const all: {roots: Element[]; signature: string[]; quality: number}[] = [];
  const cache = new WeakMap<Element, Map<string, Element>>();
  let examined = 0;
  let candidateRoots = 0;
  let comparisons = 0;
  const trees = scope === document ? accessibleDocuments(document).flatMap(frame => openTrees(frame)) : openTrees(scope);
  for (const root of trees.flatMap(tree => Array.from(tree.querySelectorAll(boundaries)))) {
    if (examined >= boundaryLimit) break;
    examined++;
    const parent = root.parentElement;
    if (!parent || !inspectable(root) || !visible(root)) continue;
    const entries = slots(root);
    if (entries.size < 2 || ![...entries.values()].some(element => element.matches(interactive))) continue;
    candidateRoots++;
    cache.set(root, entries);
    const signature = fingerprint(root, entries);
    const className = Array.from(root.classList).find(name => !instability(name)) ?? '';
    const family = [kind(root), root.getAttribute('data-slot'), root.getAttribute('data-component'), className].join('|');
    let map = parents.get(parent);
    if (!map) {map = new Map(); parents.set(parent, map);}
    const groups = map.get(family) ?? [];
    const similar = groups.find(group => {
      comparisons++;
      return signatureSimilarity(group.signature, signature) >= 0.8;
    });
    if (similar) {
      similar.roots.push(root);
      similar.quality = Math.min(similar.quality, signatureSimilarity(similar.signature, signature));
    } else {
      const group = {roots: [root], signature, quality: 1};
      groups.push(group);
      map.set(family, groups);
      all.push(group);
    }
  }
  const definitions = all.filter(group => group.roots.length > 1)
    .sort((a, b) => b.quality * b.roots.length - a.quality * a.roots.length)
    .slice(0, groupLimit).map(group => describeComponent(
      group.roots.slice(0, instanceLimit), collection, settings, group.quality, cache, group.roots));
  measure?.({boundaries: examined, candidateRoots, comparisons, groups: definitions.length});
  return definitions;
}

export function relativeComponentRoot(parents: Element[], children: Element[], collection: ElementCollection,
  settings: LocatorSettings, multiple: boolean) {
  if (!parents.length || !children.length || children.some(child =>
    !parents.some(parent => parent !== child && parent.contains(child)))) return;
  const sampleParent = parents.find(parent => parent !== children[0] && parent.contains(children[0]));
  if (!sampleParent) return;
  const match = createDomMatcher(document);
  const selectors: Locator[] = rootSelectors(children).map(selector => ({strategy: 'css', selector}));
  if (!multiple) selectors.unshift(...collection.builder(settings, sampleParent)(children[0], true).row.candidates
    .filter(item => item.basis !== 'Structural fallback').map(item => item.locator));
  const locator = selectors.find(locator => locatorIsValid(locator) && parents.every(parent => {
    const expected = children.filter(child => parent !== child && parent.contains(child));
    if (!expected.length || (!multiple && expected.length !== 1)) return false;
    const actual = match(locator, parent);
    return actual.length === expected.length && expected.every(child => actual.includes(child));
  }));
  if (locator) return {locator, observations: parents.map(parent => ({
    parentReference: collection.id(parent),
    childReferences: children.filter(child => parent.contains(child)).map(child => collection.id(child)),
  }))};
}
