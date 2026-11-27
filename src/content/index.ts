import {inspectorPort, readSettings, type InspectorEvent} from '../core/inspector';
import {defaultSettings} from '../core/locator';
import {ElementCollection} from './elements';
import {Highlights} from './highlight';
import {Inspector} from './inspector';
import {RuntimeCorrelation} from './runtime-correlation';

function install() {
  const collection = new ElementCollection();
  const highlights = new Highlights();
  const runtime = new RuntimeCorrelation(collection);
  window.addEventListener('pagehide', () => runtime.close());
  let active: {port: chrome.runtime.Port; inspector: Inspector} | undefined;

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
    } else if (message?.type === 'POM_RUNTIME_MARK' && typeof message.documentKey === 'string' &&
      (message.referenceId === undefined || typeof message.referenceId === 'string')) {
      reply(runtime.begin(message.documentKey, message.referenceId) ?? null);
    } else if (message?.type === 'POM_RUNTIME_RELEASE' && typeof message.attribute === 'string') {
      reply(runtime.release(message.attribute));
    } else if (message?.type === 'POM_HIGHLIGHT' && typeof message.id === 'string') {
      const target = collection.get(message.id);
      if (target) highlights.flash(target);
      reply({ok: Boolean(target)});
    }
  });

  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== inspectorPort || (port.sender?.id && port.sender.id !== chrome.runtime.id)) return;
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
