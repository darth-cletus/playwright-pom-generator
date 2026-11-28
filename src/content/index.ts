import {inspectorPort, readSettings, type InspectorEvent} from '../core/inspector';
import {defaultSettings} from '../core/locator';
import {ElementCollection} from './elements';
import {Highlights} from './highlight';
import {Inspector} from './inspector';
import {RuntimeCorrelation} from './runtime-correlation';
import {describeComponent, discoverComponents, relativeComponentRoot} from './components';
import {lifecyclePort, lifecycleVersion, type LiveCommand} from '../core/lifecycle';
import {ApplicationLifecycle} from './lifecycle';
import {LiveDiscovery} from './live-discovery';

function install() {
  const collection = new ElementCollection();
  const highlights = new Highlights();
  const lifecycle = new ApplicationLifecycle(collection.documentKey);
  const runtime = new RuntimeCorrelation(collection, lifecycle);
  window.addEventListener('pagehide', event => {
    runtime.close();
    if (!event.persisted) lifecycle.close();
  });
  let active: {port: chrome.runtime.Port; inspector: Inspector} | undefined;
  lifecycle.onNavigation(() => active?.inspector.stop('The application navigated. Start inspection again.'));
  let live: {port: chrome.runtime.Port; discovery: LiveDiscovery} | undefined;
  function references(values: unknown): Element[] | undefined {
    if (!Array.isArray(values) || !values.length || values.length > 30 ||
      !values.every((value: unknown) => typeof value === 'string')) return;
    const nodes = [...new Set<string>(values)].map(id => collection.get(id));
    return nodes.every((node): node is Element => !!node) ? nodes : undefined;
  }

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id && sender.id !== chrome.runtime.id) return;
    if (message?.type === 'POM_SCAN') {
      const settings = message.settings === undefined ? defaultSettings : readSettings(message.settings);
      if (settings) {
        const page = collection.scan(settings);
        const staleIds = Array.isArray(message.tracked) ? message.tracked.filter((id: unknown) =>
          typeof id === 'string' && id.startsWith(collection.documentKey + ':') && !collection.get(id)) : [];
        reply({...page, staleIds});
      }
    } else if (message?.type === 'POM_COMPONENT_DISCOVER' && message.documentKey === collection.documentKey) {
      const settings = readSettings(message.settings);
      if (settings) reply(discoverComponents(collection, settings));
    } else if (message?.type === 'POM_COMPONENT_DEFINE' && message.documentKey === collection.documentKey) {
      const settings = readSettings(message.settings);
      const roots = references(message.references);
      if (settings && roots && !roots.some(root => roots.some(other => root !== other && root.contains(other)))) {
        reply(describeComponent(roots, collection, settings, 1));
      }
      else reply(null);
    } else if (message?.type === 'POM_COMPONENT_PAGE_ELEMENT' && message.documentKey === collection.documentKey &&
      typeof message.referenceId === 'string') {
      const settings = readSettings(message.settings);
      const element = collection.get(message.referenceId);
      reply(settings && element ? collection.builder(settings)(element, true).row : null);
    } else if (message?.type === 'POM_COMPONENT_HIGHLIGHT' && message.documentKey === collection.documentKey) {
      const roots = references(message.references);
      if (roots) highlights.flashComponents(roots);
      reply(Boolean(roots));
    } else if (message?.type === 'POM_COMPONENT_LINK' && message.documentKey === collection.documentKey &&
      typeof message.multiple === 'boolean') {
      const settings = readSettings(message.settings);
      const parents = references(message.parents);
      const children = references(message.children);
      reply(settings && parents && children
        ? relativeComponentRoot(parents, children, collection, settings, message.multiple) ?? null : null);
    } else if (message?.type === 'POM_RUNTIME_MARK' && typeof message.documentKey === 'string' &&
      (message.scopeId === undefined || typeof message.scopeId === 'string') &&
      (message.referenceId === undefined || typeof message.referenceId === 'string')) {
      reply(runtime.begin(message.documentKey, message.referenceId, message.scopeId) ?? null);
    } else if (message?.type === 'POM_RUNTIME_RELEASE' && typeof message.attribute === 'string') {
      reply(runtime.release(message.attribute));
    } else if (message?.type === 'POM_HIGHLIGHT' && typeof message.id === 'string') {
      const target = collection.get(message.id);
      if (target) highlights.flash(target);
      reply({ok: Boolean(target)});
    }
  });

  chrome.runtime.onConnect.addListener(port => {
    if (port.sender?.id && port.sender.id !== chrome.runtime.id) return;
    if (port.name === lifecyclePort) {
      let session: string | undefined;
      port.onMessage.addListener((message: LiveCommand) => {
        if (message?.version !== lifecycleVersion || typeof message.session !== 'string' ||
          !/^[a-f0-9-]{36}$/i.test(message.session)) return;
        if (message.type === 'start' && !session) {
          const settings = readSettings(message.settings);
          if (!settings) return;
          live?.discovery.close();
          live?.port.disconnect();
          session = message.session;
          const discovery = new LiveDiscovery(lifecycle, collection, settings, session, update => {
            try {port.postMessage(update);} catch {discovery.close();}
          });
          live = {port, discovery};
          discovery.sync();
        } else if (message.session === session && live?.port === port) {
          if (message.type === 'track') live.discovery.track(message.ids, message.collections);
          if (message.type === 'pause') live.discovery.pause();
          if (message.type === 'resume') live.discovery.resume();
          if (message.type === 'sync') live.discovery.sync();
          if (message.type === 'refresh') live.discovery.refresh();
        }
      });
      port.onDisconnect.addListener(() => {
        if (live?.port !== port) return;
        live.discovery.close();
        live = undefined;
      });
      return;
    }
    if (port.name !== inspectorPort) return;
    if (active) {
      active.inspector.stop('Inspection moved to another panel.');
      active.port.disconnect();
    }
    const emit = (event: InspectorEvent) => {
      try {
        port.postMessage(event);
      } catch {
        inspector.stop();
      }
    };
    const inspector = new Inspector(collection, highlights, emit);
    active = {port, inspector};
    const receive = (value: unknown) => {
      try {
        inspector.receive(value);
      } catch {
        inspector.stop();
        emit({type: 'error', message: 'The inspector could not process this target. Start inspection again.'});
      }
    };
    port.onMessage.addListener(receive);
    port.onDisconnect.addListener(() => {
      port.onMessage.removeListener(receive);
      inspector.stop();
      if (active?.port === port) active = undefined;
    });
  });
}

const state = globalThis as typeof globalThis & {__pomInstalled?: boolean};
if (!state.__pomInstalled) {
  state.__pomInstalled = true;
  install();
}
