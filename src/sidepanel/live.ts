import {useEffect, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import {lifecyclePort, lifecycleVersion, nextUpdate, reconcileLive, sameRevision, type LiveCommand, type LiveUpdate} from '../core/lifecycle';
import type {LocatorSettings} from '../core/locator';
import type {PageModel} from '../core/model';

type Connection = {port: chrome.runtime.Port; session: string; tab: number; update?: LiveUpdate};
type Phase = 'off' | 'connecting' | 'live' | 'paused' | 'disconnected';

export function useLive(model: PageModel | null, setModel: Dispatch<SetStateAction<PageModel | null>>, invalidate: () => void) {
  const connection = useRef<Connection | undefined>(undefined);
  const tracking = useRef<{tab: number; settings: LocatorSettings; paused: boolean} | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('off');
  const [update, setUpdate] = useState<LiveUpdate>();

  function stop(phase: Phase = 'off') {
    const active = connection.current;
    connection.current = undefined;
    active?.port.disconnect();
    tracking.current = undefined;
    setPhase(phase);
    if (phase === 'off') setUpdate(undefined);
  }

  function send(type: 'pause' | 'resume' | 'sync' | 'refresh') {
    const active = connection.current;
    if (!active) return;
    if (tracking.current && (type === 'pause' || type === 'resume')) tracking.current.paused = type === 'pause';
    active.port.postMessage({type, version: lifecycleVersion, session: active.session} satisfies LiveCommand);
    if (type === 'pause' || type === 'resume') setPhase(type === 'pause' ? 'paused' : 'connecting');
  }

  function start(tab: number, settings: LocatorSettings, documentId?: string) {
    stop();
    tracking.current = {tab, settings, paused: false};
    const port = chrome.tabs.connect(tab, {name: lifecyclePort, ...(documentId ? {documentId} : {frameId: 0})});
    const active: Connection = {port, session: crypto.randomUUID(), tab};
    connection.current = active;
    setPhase('connecting');
    port.onMessage.addListener((incoming: LiveUpdate) => {
      if (connection.current !== active || incoming?.type !== 'update' || incoming.session !== active.session) return;
      const previous = active.update;
      const result = nextUpdate(previous, incoming);
      if (result === 'sync') send('sync');
      if (result !== 'accept') return;
      active.update = incoming;
      if (previous && !sameRevision(previous.context, incoming.context)) invalidate();
      setModel(current => {
        const sameDocumentRoute = previous ?
          previous.context.documentKey === incoming.context.documentKey && previous.context.navigation === incoming.context.navigation :
          current?.documentKey === incoming.context.documentKey && incoming.context.navigation === 0;
        return reconcileLive(current, incoming, sameDocumentRoute);
      });
      setUpdate(incoming);
      setPhase(current => current === 'paused' ? current : 'live');
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      if (connection.current === active) {
        connection.current = undefined;
        setPhase('disconnected');
      }
    });
    port.postMessage({type: 'start', version: lifecycleVersion, session: active.session, settings} satisfies LiveCommand);
  }

  useEffect(() => {
    const active = connection.current;
    if (!active?.update || !model || model.documentKey !== active.update.context.documentKey) return;
    const definitions = model.components ?? [];
    const ids = new Set(model.elements.flatMap(row => row.selected && row.referenceId ? [row.referenceId] : []));
    const collections = definitions.flatMap(definition => {
      for (const instance of definition.instances) {
        if (instance.root.referenceId) ids.add(instance.root.referenceId);
      }
      for (const member of definition.members) {
        for (const observation of member.observations) if (observation.referenceId) ids.add(observation.referenceId);
      }
      return definition.collection ? [{id: definition.id, locator: definition.collection.locator}] : [];
    });
    const scoped = [...ids].filter(id => id.startsWith(model.documentKey + ':')).slice(0, 200);
    active.port.postMessage({type: 'track', version: lifecycleVersion, session: active.session,
      ids: scoped, collections: collections.slice(0, 24)} satisfies LiveCommand);
  }, [model, update?.context.documentKey]);

  useEffect(() => {
    const activated = ({tabId}: chrome.tabs.TabActiveInfo) => {
      if (tracking.current && tracking.current.tab !== tabId) stop('disconnected');
    };
    const updated = async (tab: number, change: chrome.tabs.TabChangeInfo) => {
      const tracked = tracking.current;
      if (!tracked || tracked.tab !== tab || change.status !== 'complete' || connection.current || tracked.paused) return;
      try {
        const [injected] = await chrome.scripting.executeScript({target: {tabId: tab}, files: ['content.js']});
        if (tracking.current === tracked && !connection.current) start(tab, tracked.settings, injected?.documentId);
      } catch {
        if (tracking.current === tracked) stop('disconnected');
      }
    };
    chrome.tabs.onActivated?.addListener(activated);
    chrome.tabs.onUpdated?.addListener(updated);
    return () => {
      chrome.tabs.onActivated?.removeListener(activated);
      chrome.tabs.onUpdated?.removeListener(updated);
      const active = connection.current;
      connection.current = undefined;
      active?.port.disconnect();
    };
  }, []);

  return {phase, update, start, stop, send, tab: tracking.current?.tab};
}
